"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, RoundedBox, Line } from "@react-three/drei";
import * as THREE from "three";
import { PageShell } from "@/components/dashboard/page-shell";
import { Loader2, X, ListTodo, ShieldCheck, GitBranch, AlertTriangle, Clock, Activity, Monitor } from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import { getDepartments } from "@/lib/data/departments";
import { getTasks } from "@/lib/data/tasks";
import { getFeedEvents } from "@/lib/data/feed";
import { getProjects } from "@/lib/data/projects";
import { getCapabilityGaps } from "@/lib/data/capability-governance";
import { deriveAgentPresence, getPresenceConfig, type AgentPresence, type PresenceState } from "@/lib/data/presence";
import { computeCollaborationSignals, computeCoordinationState, type CollaborationSignal, type CoordinationState } from "@/lib/data/collaboration";
import { computeOrchestratorGovernance, type GovernanceSignal, type OrchestratorGovernance } from "@/lib/data/governance";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, TaskWithAgent, Department, FeedEvent, Project } from "@/types/dashboard";

// ─── Helpers ───

function timeAgo(iso: string | null): string {
  if (!iso) return "away";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return "active now";
  if (mins < 60) return `${mins}m ago`;
  return `away ${Math.floor(mins / 60)}h`;
}

const DIRECT_SHORT_IDS = ["research-agent", "executive-finance", "qa-agent"];

function getAgentDeptSlug(agent: Agent): string {
  if (DIRECT_SHORT_IDS.includes(agent.short_id)) return "direct";
  return (agent as any).department_slug ?? "";
}

// ─── 3D Layout Configuration ───

const DEPT_POSITIONS: Record<string, [number, number, number]> = {
  "export-growth": [-6, 0, 2],
  "ops-improvement": [0, 0, 5],
  "architecture-systems": [6, 0, 2],
  "direct": [0, 0, -2],
};

const DESK_OFFSETS: [number, number, number][] = [
  [-1.2, 0, -0.6], [0, 0, -0.6], [1.2, 0, -0.6],
  [-1.2, 0, 0.6], [0, 0, 0.6], [1.2, 0, 0.6],
];

const MEETING_POSITION: [number, number, number] = [0, 0, -5];
const REVIEW_POSITION: [number, number, number] = [8, 0, -3];
const ATTENTION_POSITION: [number, number, number] = [-8, 0, -3];
const ORCHESTRATOR_POSITION: [number, number, number] = [0, 0, 0];

// ─── Stable Slot Positions ───
// Each zone has predefined slots so agents always return to the same position

const MEETING_SLOTS: [number, number, number][] = [
  [-1.2, 0, -0.5], [0, 0, -0.5], [1.2, 0, -0.5],   // front side
  [-1.2, 0, 0.5], [0, 0, 0.5], [1.2, 0, 0.5],       // back side
];

const REVIEW_SLOTS: [number, number, number][] = [
  [-1, 0, 0.8], [0, 0, 0.8], [1, 0, 0.8],           // in front of review desk
];

const ATTENTION_SLOTS: [number, number, number][] = [
  [-0.8, 0, 0.7], [0, 0, 0.7], [0.8, 0, 0.7],       // in front of attention desk
];

// State → zone mapping
function getTargetZone(state: PresenceState): string {
  if (state === "in_discussion") return "meeting";
  if (state === "in_review" || state === "waiting_for_input") return "review";
  if (state === "blocked") return "attention";
  return "desk"; // working, available, paused, offline
}

// Get slot position for an agent in a zone
function getSlotPosition(zone: string, slotIndex: number): [number, number, number] {
  let slots: [number, number, number][];
  let base: [number, number, number];

  if (zone === "meeting") {
    slots = MEETING_SLOTS;
    base = MEETING_POSITION;
  } else if (zone === "review") {
    slots = REVIEW_SLOTS;
    base = REVIEW_POSITION;
  } else if (zone === "attention") {
    slots = ATTENTION_SLOTS;
    base = ATTENTION_POSITION;
  } else {
    return [0, 0, 0]; // desk uses home position
  }

  const slot = slots[slotIndex % slots.length];
  return [base[0] + slot[0], 0, base[2] + slot[2]];
}

// Compute target position using stable slots
function computeTargetPosition(
  agentId: string,
  state: PresenceState,
  homePosition: [number, number, number],
  agentSlotMap: Map<string, number> // agentId → slot index in current zone
): [number, number, number] {
  const zone = getTargetZone(state);

  if (zone === "desk") {
    return homePosition;
  }

  const slotIndex = agentSlotMap.get(agentId) ?? 0;
  return getSlotPosition(zone, slotIndex);
}

// Assign stable slots to agents in the same zone
// Slot assignment is deterministic: agents sorted by ID, first agent gets slot 0
function assignSlots(agents: Agent[], presences: AgentPresence[]): Map<string, number> {
  const zoneGroups: Record<string, string[]> = {};

  for (const agent of agents) {
    const presence = presences.find((p) => p.agentId === agent.id);
    const state = presence?.state ?? "available";
    const zone = getTargetZone(state);
    if (zone === "desk") continue; // desk agents use home position
    if (!zoneGroups[zone]) zoneGroups[zone] = [];
    zoneGroups[zone].push(agent.id);
  }

  const slotMap = new Map<string, number>();
  for (const [zone, agentIds] of Object.entries(zoneGroups)) {
    // Sort by agent ID for deterministic slot assignment
    const sorted = [...agentIds].sort();
    sorted.forEach((id, idx) => {
      slotMap.set(id, idx);
    });
  }

  return slotMap;
}
function computeHomePositions(agents: Agent[]): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  const deptCounts: Record<string, number> = {};

  for (const agent of agents) {
    const deptSlug = getAgentDeptSlug(agent);
    const deptPos = DEPT_POSITIONS[deptSlug] ?? DEPT_POSITIONS["direct"];
    const idx = deptCounts[deptSlug] ?? 0;
    deptCounts[deptSlug] = idx + 1;

    const offset = DESK_OFFSETS[idx % DESK_OFFSETS.length];
    positions.set(agent.id, [
      deptPos[0] + offset[0],
      0,
      deptPos[2] + offset[2],
    ]);
  }

  return positions;
}

// ─── Presence dot color ───

function getDotColor(state: PresenceState): string {
  if (state === "working") return "#3b82f6";
  if (state === "in_discussion") return "#8b5cf6";
  if (state === "in_review" || state === "waiting_for_input") return "#f59e0b";
  if (state === "blocked") return "#ef4444";
  if (state === "available") return "#22c55e";
  return "#6b7280"; // paused, offline
}

// ─── Department color ───

function getDeptColor(slug: string): string {
  if (slug === "export-growth") return "#3b82f6";
  if (slug === "ops-improvement") return "#f59e0b";
  if (slug === "architecture-systems") return "#8b5cf6";
  return "#22c55e"; // direct
}

// ═══════════════════════════════════════
// 3D Components
// ═══════════════════════════════════════

// ─── Room ───

function Room3D() {
  return (
    <group>
      {/* Floor — slightly lighter for furniture contrast */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[28, 20]} />
        <meshStandardMaterial color="#1e2433" roughness={0.8} />
      </mesh>
      {/* Subtle grid */}
      <gridHelper args={[28, 14, "#2a3248", "#242c3c"]} position={[0, -0.04, 0]} />

      {/* Back wall */}
      <mesh position={[0, 2.5, -10]} receiveShadow>
        <boxGeometry args={[28, 5, 0.2]} />
        <meshStandardMaterial color="#171d2a" />
      </mesh>
      {/* Left wall */}
      <mesh position={[-14, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[20, 5, 0.2]} />
        <meshStandardMaterial color="#191f2c" />
      </mesh>
      {/* Right wall */}
      <mesh position={[14, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[20, 5, 0.2]} />
        <meshStandardMaterial color="#191f2c" />
      </mesh>
      {/* Entrance wall (partial — with opening) */}
      <mesh position={[-8, 2.5, 10]} receiveShadow>
        <boxGeometry args={[12, 5, 0.2]} />
        <meshStandardMaterial color="#191f2c" />
      </mesh>
      <mesh position={[8, 2.5, 10]} receiveShadow>
        <boxGeometry args={[12, 5, 0.2]} />
        <meshStandardMaterial color="#191f2c" />
      </mesh>

      {/* Department floor pads with stronger identity */}
      {Object.entries(DEPT_POSITIONS).map(([slug, pos]) => {
        const color = getDeptColor(slug);
        return (
          <group key={slug}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], 0.003, pos[2]]}>
              <circleGeometry args={[3, 6]} />
              <meshStandardMaterial color={color} transparent opacity={0.08} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], 0.006, pos[2]]}>
              <ringGeometry args={[2.8, 3, 6]} />
              <meshStandardMaterial color={color} transparent opacity={0.2} />
            </mesh>
          </group>
        );
      })}

      {/* Meeting floor pad (hexagonal) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MEETING_POSITION[0], 0.003, MEETING_POSITION[2]]}>
        <circleGeometry args={[2.5, 6]} />
        <meshStandardMaterial color="#8b5cf6" transparent opacity={0.06} />
      </mesh>

      {/* Review floor pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[REVIEW_POSITION[0], 0.003, REVIEW_POSITION[2]]}>
        <circleGeometry args={[2.2, 6]} />
        <meshStandardMaterial color="#f59e0b" transparent opacity={0.06} />
      </mesh>

      {/* Attention floor pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ATTENTION_POSITION[0], 0.003, ATTENTION_POSITION[2]]}>
        <circleGeometry args={[2, 6]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.05} />
      </mesh>
    </group>
  );
}

// ─── Desk ───

function Desk3D({ position, color, label, occupied }: {
  position: [number, number, number]; color: string; label: string; occupied: boolean;
}) {
  return (
    <group position={position}>
      {/* Desk surface — wider office desk */}
      <RoundedBox args={[1.6, 0.05, 0.9]} radius={0.02} position={[0, 0.75, 0]} castShadow>
        <meshStandardMaterial color={occupied ? "#2c3548" : "#242c3c"} roughness={0.6} />
      </RoundedBox>
      {/* Desk frame/edge (stronger outline) */}
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[1.65, 0.03, 0.95]} />
        <meshStandardMaterial color="#1a2030" />
      </mesh>
      {/* Desk legs — metal style */}
      {[[-0.7, 0, -0.35], [0.7, 0, -0.35], [-0.7, 0, 0.35], [0.7, 0, 0.35]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.375, pos[2]]}>
          <boxGeometry args={[0.04, 0.75, 0.04]} />
          <meshStandardMaterial color="#151c28" metalness={0.3} roughness={0.7} />
        </mesh>
      ))}

      {/* Monitor — larger, more office-like */}
      <mesh position={[0, 1.05, -0.35]} castShadow>
        <boxGeometry args={[0.7, 0.45, 0.03]} />
        <meshStandardMaterial color="#1a2435" emissive={occupied ? color : "#000000"} emissiveIntensity={occupied ? 0.08 : 0} />
      </mesh>
      {/* Monitor bezel */}
      <mesh position={[0, 1.05, -0.36]}>
        <boxGeometry args={[0.72, 0.47, 0.01]} />
        <meshStandardMaterial color="#111825" />
      </mesh>
      {/* Monitor arm */}
      <mesh position={[0, 0.85, -0.25]}>
        <boxGeometry args={[0.06, 0.25, 0.06]} />
        <meshStandardMaterial color="#151c28" />
      </mesh>
      {/* Monitor base */}
      <mesh position={[0, 0.78, -0.15]}>
        <boxGeometry args={[0.25, 0.02, 0.15]} />
        <meshStandardMaterial color="#151c28" />
      </mesh>

      {/* Chair — stronger contrast, more visible */}
      <mesh position={[0, 0.38, 0.6]}>
        <boxGeometry args={[0.4, 0.05, 0.4]} />
        <meshStandardMaterial color="#252d3d" roughness={0.8} />
      </mesh>
      {/* Chair back */}
      <mesh position={[0, 0.62, 0.78]}>
        <boxGeometry args={[0.4, 0.5, 0.04]} />
        <meshStandardMaterial color="#252d3d" roughness={0.8} />
      </mesh>
      {/* Chair legs — visible metal */}
      {[[-0.16, 0, -0.16], [0.16, 0, -0.16], [-0.16, 0, 0.16], [0.16, 0, 0.16]].map((lp, li) => (
        <mesh key={li} position={[lp[0], 0.19, 0.6 + lp[2]]}>
          <boxGeometry args={[0.03, 0.38, 0.03]} />
          <meshStandardMaterial color="#1a2030" metalness={0.3} roughness={0.7} />
        </mesh>
      ))}

      {/* Label */}
      <Text position={[0, 0.79, 0.4]} fontSize={0.08} color="#7F8A9A" anchorX="center" anchorY="middle">
        {label}
      </Text>

      {/* Status indicator */}
      <mesh position={[0.7, 0.79, -0.35]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={occupied ? color : "#3a4555"} emissive={occupied ? color : "#000000"} emissiveIntensity={occupied ? 0.6 : 0} />
      </mesh>
    </group>
  );
}

// ─── Department Cluster ───

function DeptCluster3D({ slug, label, color, agents: clusterAgents, homePositions, presences, onSelectAgent }: {
  slug: string; label: string; color: string;
  agents: Agent[]; homePositions: Map<string, [number, number, number]>;
  presences: AgentPresence[]; onSelectAgent: (a: Agent) => void;
}) {
  const deptPos = DEPT_POSITIONS[slug] ?? [0, 0, 0];

  return (
    <group position={deptPos}>
      {/* Floor pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[2.5, 32]} />
        <meshStandardMaterial color={color} transparent opacity={0.05} />
      </mesh>

      {/* Department label */}
      <Text position={[0, 0.05, 2.2]} fontSize={0.2} color={color} anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]}>
        {label}
      </Text>

      {/* Desks */}
      {clusterAgents.map((agent, i) => {
        const offset = DESK_OFFSETS[i % DESK_OFFSETS.length];
        const homePos: [number, number, number] = [offset[0], 0, offset[2]];
        const presence = presences.find((p) => p.agentId === agent.id);
        const isOccupied = presence ? presence.state !== "paused" && presence.state !== "offline" : false;

        return (
          <group key={agent.id} onClick={() => onSelectAgent(agent)}>
            <Desk3D position={homePos} color={color} label={agent.name.split(" ")[0]} occupied={isOccupied} />
          </group>
        );
      })}
    </group>
  );
}

// ─── Meeting Table ───

function MeetingTable3D() {
  return (
    <group position={MEETING_POSITION}>
      {/* Round table surface */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[1.3, 1.3, 0.08, 24]} />
        <meshStandardMaterial color="#2d2050" roughness={0.5} />
      </mesh>
      {/* Table edge ring */}
      <mesh position={[0, 0.8, 0]}>
        <torusGeometry args={[1.3, 0.03, 8, 24]} />
        <meshStandardMaterial color="#3d2860" />
      </mesh>
      {/* Central pedestal */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 0.8, 12]} />
        <meshStandardMaterial color="#1a1530" />
      </mesh>
      {/* Pedestal base */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 12]} />
        <meshStandardMaterial color="#1a1530" />
      </mesh>

      {/* Label */}
      <Text position={[0, 0.95, 0]} fontSize={0.14} color="#8b5cf6" anchorX="center" anchorY="middle">
        Meeting Table
      </Text>

      {/* Chairs around table (matching MEETING_SLOTS) */}
      {MEETING_SLOTS.map((slot, i) => {
        // Face toward center
        const angle = Math.atan2(slot[0], slot[2]);
        return (
          <group key={i} position={slot} rotation={[0, angle + Math.PI, 0]}>
            {/* Chair seat */}
            <mesh position={[0, 0.38, 0]}>
              <boxGeometry args={[0.38, 0.05, 0.38]} />
              <meshStandardMaterial color="#252040" roughness={0.8} />
            </mesh>
            {/* Chair back */}
            <mesh position={[0, 0.6, 0.18]}>
              <boxGeometry args={[0.38, 0.45, 0.04]} />
              <meshStandardMaterial color="#252040" roughness={0.8} />
            </mesh>
            {/* Chair legs */}
            {[[-0.15, 0, -0.15], [0.15, 0, -0.15], [-0.15, 0, 0.15], [0.15, 0, 0.15]].map((lp, li) => (
              <mesh key={li} position={[lp[0], 0.19, lp[2]]}>
                <boxGeometry args={[0.03, 0.38, 0.03]} />
                <meshStandardMaterial color="#1a1828" metalness={0.3} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

// ─── Review Area ───

function ReviewArea3D() {
  return (
    <group position={REVIEW_POSITION}>
      {/* Review desk */}
      <RoundedBox args={[2, 0.08, 1]} radius={0.04} position={[0, 0.75, 0]} castShadow>
        <meshStandardMaterial color="#3d2e0f" />
      </RoundedBox>
      {/* Desk legs */}
      {[[-0.8, 0, -0.35], [0.8, 0, -0.35], [-0.8, 0, 0.35], [0.8, 0, 0.35]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.375, pos[2]]}>
          <boxGeometry args={[0.06, 0.75, 0.06]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      ))}
      {/* Review monitor */}
      <mesh position={[0, 1, -0.35]} castShadow>
        <boxGeometry args={[0.5, 0.35, 0.03]} />
        <meshStandardMaterial color="#1e293b" emissive="#f59e0b" emissiveIntensity={0.05} />
      </mesh>
      <mesh position={[0, 0.82, -0.35]}>
        <boxGeometry args={[0.06, 0.12, 0.05]} />
        <meshStandardMaterial color="#1a1f2e" />
      </mesh>
      {/* Label */}
      <Text position={[0, 0.9, 0.4]} fontSize={0.13} color="#f59e0b" anchorX="center" anchorY="middle">
        Review Corner
      </Text>
      {/* Review chair (for reviewer) */}
      <mesh position={[0, 0.35, 0.55]}>
        <boxGeometry args={[0.35, 0.04, 0.35]} />
        <meshStandardMaterial color="#2a2010" />
      </mesh>
      <mesh position={[0, 0.55, 0.7]}>
        <boxGeometry args={[0.35, 0.4, 0.04]} />
        <meshStandardMaterial color="#2a2010" />
      </mesh>
    </group>
  );
}

// ─── Attention Area ───

function AttentionArea3D() {
  return (
    <group position={ATTENTION_POSITION}>
      {/* Attention desk */}
      <RoundedBox args={[1.5, 0.08, 0.8]} radius={0.04} position={[0, 0.75, 0]} castShadow>
        <meshStandardMaterial color="#3d1515" />
      </RoundedBox>
      {/* Desk legs */}
      {[[-0.6, 0, -0.3], [0.6, 0, -0.3], [-0.6, 0, 0.3], [0.6, 0, 0.3]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.375, pos[2]]}>
          <boxGeometry args={[0.05, 0.75, 0.05]} />
          <meshStandardMaterial color="#2a1010" />
        </mesh>
      ))}
      {/* Attention monitor */}
      <mesh position={[0, 1, -0.3]} castShadow>
        <boxGeometry args={[0.45, 0.3, 0.03]} />
        <meshStandardMaterial color="#1e2025" emissive="#ef4444" emissiveIntensity={0.05} />
      </mesh>
      <mesh position={[0, 0.82, -0.3]}>
        <boxGeometry args={[0.06, 0.12, 0.05]} />
        <meshStandardMaterial color="#1a1f2e" />
      </mesh>
      {/* Label */}
      <Text position={[0, 0.9, 0.35]} fontSize={0.13} color="#ef4444" anchorX="center" anchorY="middle">
        Attention
      </Text>
      {/* Chair */}
      <mesh position={[0, 0.35, 0.45]}>
        <boxGeometry args={[0.3, 0.04, 0.3]} />
        <meshStandardMaterial color="#2a1515" />
      </mesh>
      <mesh position={[0, 0.55, 0.58]}>
        <boxGeometry args={[0.3, 0.35, 0.04]} />
        <meshStandardMaterial color="#2a1515" />
      </mesh>
    </group>
  );
}

// ─── Reception Area ───

function ReceptionArea3D() {
  return (
    <group position={[0, 0, 8]}>
      {/* Reception desk (long, facing entrance) */}
      <RoundedBox args={[3, 0.8, 0.6]} radius={0.04} position={[0, 0.4, 0]} castShadow>
        <meshStandardMaterial color="#1e2535" roughness={0.7} />
      </RoundedBox>
      {/* Desk top surface */}
      <RoundedBox args={[3.1, 0.04, 0.7]} radius={0.02} position={[0, 0.82, 0]} castShadow>
        <meshStandardMaterial color="#2a3548" roughness={0.5} />
      </RoundedBox>
      {/* Label */}
      <Text position={[0, 0.95, -0.2]} fontSize={0.14} color="#7F8A9A" anchorX="center" anchorY="middle">
        Reception
      </Text>
    </group>
  );
}

// ─── Orchestrator (Yas Claw) ───

function Orchestrator3D({ coordination }: { coordination: CoordinationState }) {
  return (
    <group position={ORCHESTRATOR_POSITION}>
      {/* Platform */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[2, 32]} />
        <meshStandardMaterial color="#22C7B8" transparent opacity={0.08} />
      </mesh>
      {/* Desk */}
      <RoundedBox args={[2, 0.1, 1.2]} radius={0.06} position={[0, 0.8, 0]} castShadow>
        <meshStandardMaterial color="#1a3030" />
      </RoundedBox>
      {/* Accent border */}
      <RoundedBox args={[2.1, 0.12, 1.3]} radius={0.06} position={[0, 0.79, 0]}>
        <meshStandardMaterial color="#22C7B8" transparent opacity={0.3} />
      </RoundedBox>
      {/* Label */}
      <Text position={[0, 1, 0]} fontSize={0.2} color="#22C7B8" anchorX="center" anchorY="middle" fontWeight="bold">
        🦀 Yas Claw
      </Text>
      <Text position={[0, 0.95, 0.5]} fontSize={0.1} color="#22C7B8" anchorX="center" anchorY="middle">
        ORCHESTRATOR
      </Text>
      {/* Coordination indicator */}
      {coordination.isCoordinating && (
        <mesh position={[0.8, 1.05, -0.4]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={1} />
        </mesh>
      )}
    </group>
  );
}

// ─── Connection Lines ───

function ConnectionLines() {
  const lines = useMemo(() => {
    const result: { points: [THREE.Vector3, THREE.Vector3]; color: string }[] = [];
    for (const pos of Object.values(DEPT_POSITIONS)) {
      result.push({
        points: [
          new THREE.Vector3(ORCHESTRATOR_POSITION[0], 0.5, ORCHESTRATOR_POSITION[2]),
          new THREE.Vector3(pos[0], 0.5, pos[2]),
        ],
        color: "#22C7B8",
      });
    }
    result.push({
      points: [
        new THREE.Vector3(ORCHESTRATOR_POSITION[0], 0.5, ORCHESTRATOR_POSITION[2]),
        new THREE.Vector3(MEETING_POSITION[0], 0.5, MEETING_POSITION[2]),
      ],
      color: "#22C7B8",
    });
    return result;
  }, []);

  return (
    <group>
      {lines.map((line, i) => (
        <Line key={i} points={line.points} color={line.color} lineWidth={1} opacity={0.15} transparent />
      ))}
    </group>
  );
}

// ─── Agent (3D figure) ───

function Agent3D({
  agent,
  presence,
  homePosition,
  slotMap,
  signal,
  govSignals,
  onClick,
}: {
  agent: Agent;
  presence: AgentPresence | undefined;
  homePosition: [number, number, number];
  slotMap: Map<string, number>;
  signal: CollaborationSignal | undefined;
  govSignals: GovernanceSignal[];
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const targetRef = useRef<[number, number, number]>([...homePosition]);
  const currentRef = useRef<[number, number, number]>([...homePosition]);
  const facingRef = useRef<number>(0); // y-rotation
  const bobRef = useRef<number>(0); // walking bob phase
  const sitRef = useRef<number>(0); // sitting interpolation (0=standing, 1=sitting)

  const state = presence?.state ?? "available";
  const dotColor = getDotColor(state);
  const isAway = state === "paused" || state === "offline";
  const hasAlert = govSignals.some((s) => s.severity === "critical" || s.severity === "attention");
  const zone = getTargetZone(state);
  const shouldSit = zone === "desk"; // sit when at desk

  // Compute target position based on state
  useEffect(() => {
    const zone = getTargetZone(state);
    if (zone === "desk") {
      targetRef.current = [...homePosition];
    } else {
      const slotIndex = slotMap.get(agent.id) ?? 0;
      targetRef.current = getSlotPosition(zone, slotIndex);
    }
  }, [state, homePosition, slotMap, agent.id]);

  // Smooth movement + facing + walking bob + sitting transition
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = targetRef.current;
    const current = currentRef.current;
    const speed = 2.5; // units per second

    const dx = target[0] - current[0];
    const dz = target[2] - current[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    const isMoving = dist > 0.05;

    if (isMoving) {
      // Move toward target
      const step = Math.min(speed * delta, dist);
      current[0] += (dx / dist) * step;
      current[2] += (dz / dist) * step;
      meshRef.current.position.set(current[0], 0, current[2]);

      // Face movement direction
      facingRef.current = Math.atan2(dx, dz);
      meshRef.current.rotation.y = facingRef.current;

      // Walking bob
      bobRef.current += delta * 8;
      meshRef.current.position.y = Math.abs(Math.sin(bobRef.current)) * 0.04;

      // Stand up while moving
      sitRef.current = Math.max(0, sitRef.current - delta * 3);
    } else {
      // At destination
      bobRef.current = 0;

      // Sitting transition
      if (shouldSit) {
        sitRef.current = Math.min(1, sitRef.current + delta * 2);
      } else {
        sitRef.current = Math.max(0, sitRef.current - delta * 3);
      }

      // Apply sitting offset (lower position when seated)
      meshRef.current.position.y = -sitRef.current * 0.2;

      // Face toward zone center when stationary
      let faceTarget: [number, number] = [0, 0];
      if (zone === "desk") {
        faceTarget = [homePosition[0], homePosition[2] - 0.5]; // face desk
      } else if (zone === "meeting") {
        faceTarget = [MEETING_POSITION[0], MEETING_POSITION[2]]; // face table center
      } else if (zone === "review") {
        faceTarget = [REVIEW_POSITION[0], REVIEW_POSITION[2]]; // face review desk
      } else if (zone === "attention") {
        faceTarget = [ATTENTION_POSITION[0], ATTENTION_POSITION[2]]; // face attention desk
      }
      const faceDx = faceTarget[0] - current[0];
      const faceDz = faceTarget[1] - current[2];
      const targetAngle = Math.atan2(faceDx, faceDz);
      let angleDiff = targetAngle - facingRef.current;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      facingRef.current += angleDiff * Math.min(1, delta * 5);
      meshRef.current.rotation.y = facingRef.current;
    }
  });

  const config = presence ? getPresenceConfig(presence.state) : null;

  return (
    <group ref={meshRef} position={[homePosition[0], 0, homePosition[2]]} onClick={onClick}>
      {/* Body (taller, slimmer capsule) */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.5, 8, 16]} />
        <meshStandardMaterial color={isAway ? "#4a5568" : "#2a3040"} transparent={isAway} opacity={isAway ? 0.4 : 1} />
      </mesh>
      {/* Shoulders */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[0.35, 0.06, 0.18]} />
        <meshStandardMaterial color={isAway ? "#4a5568" : "#2a3040"} transparent={isAway} opacity={isAway ? 0.4 : 1} />
      </mesh>
      {/* Head (slightly larger) */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color={isAway ? "#6b7280" : "#e2e8f0"} transparent={isAway} opacity={isAway ? 0.4 : 1} />
      </mesh>

      {/* Presence dot (shoulder) */}
      <mesh position={[0.15, 0.9, -0.08]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={dotColor} emissive={dotColor} emissiveIntensity={state === "working" || state === "in_discussion" ? 0.8 : 0.3} />
      </mesh>

      {/* Alert indicator */}
      {hasAlert && (
        <mesh position={[-0.15, 0.9, -0.08]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} />
        </mesh>
      )}

      {/* Name label (above head) */}
      <Text position={[0, 1.35, 0]} fontSize={0.1} color="#F5F7FA" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000000">
        {agent.emoji} {agent.name.split(" ")[0]}
      </Text>

      {/* State label (below name) */}
      <Text position={[0, 1.22, 0]} fontSize={0.065} color={config?.color === "var(--info)" ? "#3b82f6" : config?.color === "var(--warning)" ? "#f59e0b" : config?.color === "var(--danger)" ? "#ef4444" : config?.color === "var(--success)" ? "#22c55e" : "#7F8A9A"} anchorX="center" anchorY="middle" outlineWidth={0.005} outlineColor="#000000">
        {config?.label ?? state}
      </Text>
    </group>
  );
}

// ═══════════════════════════════════════
// Detail Panel (preserved from previous phases)
// ═══════════════════════════════════════

const EVENT_CONFIG: Record<string, { color: string; label: string }> = {
  task_created: { color: "var(--info)", label: "Created" },
  task_updated: { color: "var(--text-quiet)", label: "Updated" },
  task_completed: { color: "var(--success)", label: "Completed" },
  agent_routed: { color: "var(--info)", label: "Routed" },
  blocker_detected: { color: "var(--danger)", label: "Blocker" },
  blocker_resolved: { color: "var(--success)", label: "Resolved" },
};

function AgentDetailPanel({ agent, presence, signal, tasks, events, departments, projects, onClose }: {
  agent: Agent; presence: AgentPresence; signal: CollaborationSignal | undefined;
  tasks: TaskWithAgent[]; events: FeedEvent[]; departments: Department[]; projects: Project[];
  onClose: () => void;
}) {
  const config = getPresenceConfig(presence.state);
  const allAgentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
  const openAgentTasks = allAgentTasks.filter((t) => t.status !== "done");
  const agentEvents = events.filter((e) => e.related_agent_id === agent.id).slice(0, 8);
  const dept = departments.find((d) => d.slug === (agent as any).department_slug || d.id === (agent as any).department_id);
  const departmentLabel = dept ? dept.name : DIRECT_SHORT_IDS.includes(agent.short_id) ? "Direct" : "Unassigned";

  const today = new Date().toISOString().slice(0, 10);
  const completedToday = allAgentTasks.filter((t) => t.status === "done" && t.updated_at?.slice(0, 10) === today).length;
  const inProgressToday = allAgentTasks.filter((t) => t.status === "in-progress").length;
  const inReviewToday = allAgentTasks.filter((t) => t.status === "in-review").length;
  const blockedToday = allAgentTasks.filter((t) => t.status === "blocked").length;

  const primaryTask = openAgentTasks.find((t) => t.status === "in-progress") ?? openAgentTasks[0] ?? null;
  const waitingTask = openAgentTasks.find((t) => t.status === "in-review");
  const blockedTask = openAgentTasks.find((t) => t.status === "blocked");
  const linkedProject = primaryTask?.project_id ? projects.find((p) => p.id === primaryTask.project_id) : null;

  return (
    <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto" style={{ width: "min(380px, 92vw)", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "0 0 20px rgba(0,0,0,0.1)" }}>
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-2xl">{agent.emoji}</span>
            <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${config?.dot ?? "dot-gray"}`} style={{ borderColor: "var(--surface)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{agent.name}</p>
            <p className="text-[11px]" style={{ color: "var(--text-quiet)" }}>{departmentLabel}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: "var(--text-quiet)" }}><X className="h-4 w-4" /></button>
      </div>

      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <div className={`h-2 w-2 rounded-full ${config?.dot ?? "dot-gray"}`} />
          <span className="text-xs font-semibold" style={{ color: config?.color ?? "var(--text-quiet)" }}>{config?.label ?? presence.state}</span>
        </div>
        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Last activity: {presence.lastActivity ? timeAgo(presence.lastActivity) : "None"}</p>
      </div>

      <div className="p-4 grid grid-cols-3 gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: completedToday > 0 ? "var(--success)" : "var(--text)" }}>{completedToday}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Done</p></div>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: "var(--text)" }}>{inProgressToday}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Active</p></div>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: inReviewToday > 0 ? "var(--warning)" : "var(--text)" }}>{inReviewToday}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Review</p></div>
        {blockedToday > 0 && <div className="text-center col-span-3"><p className="text-sm font-bold" style={{ color: "var(--danger)" }}>{blockedToday}</p><p className="text-[10px]" style={{ color: "var(--danger)" }}>Blocked</p></div>}
      </div>

      {(primaryTask || waitingTask || blockedTask) && (
        <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Current Context</p>
          <div className="flex flex-col gap-2">
            {primaryTask && <Link href="/tasks" className="p-2 rounded hover:opacity-80" style={{ background: "var(--surface-muted)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-quiet)" }}>Working on</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{primaryTask.title}</p></Link>}
            {waitingTask && <Link href="/reviews" className="p-2 rounded hover:opacity-80" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--warning)" }}>Awaiting review</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{waitingTask.title}</p></Link>}
            {blockedTask && <div className="p-2 rounded" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--danger)" }}>Blocked</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{blockedTask.title}</p>{blockedTask.blocker && <p className="text-[10px] mt-1" style={{ color: "var(--text-quiet)" }}>{blockedTask.blocker}</p>}</div>}
            {linkedProject && <Link href={`/projects/${linkedProject.id}`} className="p-2 rounded hover:opacity-80" style={{ background: "var(--surface-muted)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-quiet)" }}>Project</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{linkedProject.title}</p><span className="text-[9px] px-1 rounded" style={{ background: "var(--accent)", color: "white" }}>{linkedProject.project_code}</span></Link>}
          </div>
        </div>
      )}

      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-quiet)" }}>Recent Timeline</p>
        {agentEvents.length === 0 ? <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>No recent activity</p> : (
          <div className="flex flex-col gap-0">{agentEvents.map((event, i) => { const evConfig = EVENT_CONFIG[event.event_type] ?? { color: "var(--text-quiet)", label: event.event_type }; return (
            <div key={event.id} className="flex gap-2">
              <div className="flex flex-col items-center"><div className="mt-1 h-3 w-3 rounded-full" style={{ background: evConfig.color + "30", border: `1px solid ${evConfig.color}` }} />{i < agentEvents.length - 1 && <div className="w-px flex-1" style={{ background: "var(--border)" }} />}</div>
              <div className="pb-2 flex-1 min-w-0"><p className="text-[10px] truncate" style={{ color: "var(--text)" }}>{event.summary}</p><p className="text-[9px]" style={{ color: "var(--text-quiet)" }}>{timeAgo(event.created_at)}</p></div>
            </div>
          ); })}</div>
        )}
      </div>

      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Quick Links</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/agents/${agent.id}`} className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Workforce</Link>
          <Link href="/tasks" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Tasks</Link>
          <Link href="/reviews" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Reviews</Link>
          <Link href="/live-feed" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Feed</Link>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Page
// ═══════════════════════════════════════

export default function OfficePage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [presences, setPresences] = useState<AgentPresence[]>([]);
  const [signals, setSignals] = useState<Map<string, CollaborationSignal>>(new Map());
  const [coordination, setCoordination] = useState<CoordinationState>({ isCoordinating: false, recentRoutes: [], pendingReviews: [], activeDiscussions: [] });
  const [governance, setGovernance] = useState<OrchestratorGovernance>({ pendingReviews: 0, blockedAgents: 0, overloadedAgents: 0, capabilityAlerts: 0, needsAttention: 0, signals: [] });
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  async function load() {
    try {
      const [a, d, t, e, p] = await Promise.all([getAgents(), getDepartments(), getTasks(), getFeedEvents(50), getProjects()]);
      setAgents(a.data); setDepartments(d.data); setTasks(t.data); setEvents(e.data); setProjects(p.data);
      const presenceList = a.data.map((agent) => deriveAgentPresence(agent, t.data, e.data));
      setPresences(presenceList);
      const agentIds = a.data.map((agent) => agent.id);
      const collabSignals = computeCollaborationSignals(e.data, agentIds);
      setSignals(collabSignals); setCoordination(computeCoordinationState(e.data, agentIds));
      const { getAllTaskReviews } = await import("@/lib/data/reviews");
      const [reviewsResult, gapsResult] = await Promise.all([getAllTaskReviews(100), getCapabilityGaps({ limit: 50 })]);
      const reviewOutcomes = reviewsResult.data.map((r) => ({ task_id: r.task_id, outcome: r.outcome }));
      const gapsFlat = gapsResult.data.map((g) => ({ agent_id: (g as any).agent_id ?? null, urgency_level: (g as any).urgency_level ?? "low", composite_score: (g as any).composite_score ?? 0 }));
      setGovernance(computeOrchestratorGovernance(a.data, t.data, e.data, reviewOutcomes, gapsFlat));
    } catch (err) {
      console.error("Office load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "tasks", "feed_events"], loadRef);
  useEffect(() => { const interval = setInterval(() => load(), 10000); return () => clearInterval(interval); }, []);
  useEffect(() => { load(); }, []);

  // Compute home positions
  const homePositions = useMemo(() => computeHomePositions(agents), [agents]);

  // Compute stable slots for agents in special zones
  const slotMap = useMemo(() => assignSlots(agents, presences), [agents, presences]);

  // Summary counts
  const workingCount = presences.filter((p) => p.state === "working").length;
  const discussionCount = presences.filter((p) => p.state === "in_discussion").length;
  const reviewCount = presences.filter((p) => p.state === "in_review" || p.state === "waiting_for_input").length;
  const blockedCount = presences.filter((p) => p.state === "blocked").length;
  const awayCount = presences.filter((p) => p.state === "paused" || p.state === "offline").length;

  if (loading) return <PageShell title="Office" description="Loading..."><div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading 3D office...</div></PageShell>;

  const selectedPresence = selectedAgent ? presences.find((p) => p.agentId === selectedAgent.id) : null;

  return (
    <PageShell title="Office" description="3D living office — agents, movement, and real-time operations">
      {/* Summary strip */}
      <div className="rounded-lg p-3 mb-4 flex items-center gap-3 overflow-x-auto text-xs" style={{ background: "var(--background)", border: "1px solid var(--border)", WebkitOverflowScrolling: "touch" }}>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} /><span style={{ color: "var(--text-quiet)" }}>Online {presences.filter((p) => p.state !== "paused" && p.state !== "offline").length}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--info)" }} /><span style={{ color: "var(--text-quiet)" }}>Work {workingCount}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} /><span style={{ color: "var(--text-quiet)" }}>Talk {discussionCount}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--warning)" }} /><span style={{ color: "var(--text-quiet)" }}>Review {reviewCount}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ color: "var(--danger)" }} /><span style={{ color: "var(--text-quiet)" }}>Blocked {blockedCount}</span></div>
        {awayCount > 0 && <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--text-muted)" }} /><span style={{ color: "var(--text-quiet)" }}>Away {awayCount}</span></div>}
        <div className="flex items-center gap-1.5 ml-auto shrink-0"><div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} /><span style={{ color: "var(--text-quiet)" }}>live</span></div>
      </div>

      {/* 3D Canvas */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", height: "70vh", background: "#0E1116" }}>
        <Canvas shadows camera={{ position: [10, 8, 14], fov: 50 }} style={{ background: "#0E1116" }}>
          {/* Lights */}
          {/* Key light */}
          <ambientLight intensity={0.25} />
          <directionalLight position={[8, 12, 8]} intensity={0.5} castShadow shadow-mapSize={[1024, 1024]} />

          {/* Fill light (opposite side) */}
          <directionalLight position={[-6, 8, -4]} intensity={0.2} color="#8b9dc3" />

          {/* Accent lights */}
          <pointLight position={[0, 4, 0]} intensity={0.3} color="#22C7B8" distance={15} />
          <pointLight position={[MEETING_POSITION[0], 3, MEETING_POSITION[2]]} intensity={0.15} color="#8b5cf6" distance={8} />
          <pointLight position={[REVIEW_POSITION[0], 3, REVIEW_POSITION[2]]} intensity={0.12} color="#f59e0b" distance={6} />
          <pointLight position={[ATTENTION_POSITION[0], 3, ATTENTION_POSITION[2]]} intensity={0.1} color="#ef4444" distance={6} />

          {/* Room */}
          <Room3D />

          {/* Orchestrator */}
          <Orchestrator3D coordination={coordination} />

          {/* Connection lines */}
          <ConnectionLines />

          {/* Meeting table */}
          <MeetingTable3D />

          {/* Review area */}
          <ReviewArea3D />

          {/* Attention area */}
          <AttentionArea3D />

          {/* Reception area */}
          <ReceptionArea3D />

          {/* Department clusters */}
          {[
            { slug: "export-growth", label: "Export-Growth", color: "#3b82f6" },
            { slug: "ops-improvement", label: "Ops-Improvement", color: "#f59e0b" },
            { slug: "architecture-systems", label: "Architecture", color: "#8b5cf6" },
            { slug: "direct", label: "Direct", color: "#22c55e" },
          ].map((dept) => (
            <DeptCluster3D
              key={dept.slug}
              slug={dept.slug}
              label={dept.label}
              color={dept.color}
              agents={agents.filter((a) => getAgentDeptSlug(a) === dept.slug)}
              homePositions={homePositions}
              presences={presences}
              onSelectAgent={setSelectedAgent}
            />
          ))}

          {/* Agents (3D figures) */}
          {agents.map((agent) => {
            const homePos = homePositions.get(agent.id) ?? [0, 0, 0];
            const presence = presences.find((p) => p.agentId === agent.id);
            return (
              <Agent3D
                key={agent.id}
                agent={agent}
                presence={presence}
                homePosition={homePos}
                slotMap={slotMap}
                signal={signals.get(agent.id)}
                govSignals={governance.signals.filter((gs) => gs.agentId === agent.id)}
                onClick={() => setSelectedAgent(agent)}
              />
            );
          })}

          {/* Camera controls */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={5}
            maxDistance={30}
          />
        </Canvas>
      </div>

      {/* Governance row */}
      {governance.needsAttention > 0 && (
        <div className="rounded-lg p-3 mt-4 flex flex-wrap gap-2" style={{ border: "1px solid var(--border)" }}>
          {governance.pendingReviews > 0 && <Link href="/reviews" className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}><Clock className="h-2.5 w-2.5" />{governance.pendingReviews} review{governance.pendingReviews > 1 ? "s" : ""}</Link>}
          {governance.blockedAgents > 0 && <Link href="/tasks" className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}><AlertTriangle className="h-2.5 w-2.5" />{governance.blockedAgents} blocked</Link>}
          {governance.overloadedAgents > 0 && <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.08)", color: "var(--warning)" }}><Activity className="h-2.5 w-2.5" />{governance.overloadedAgents} overloaded</span>}
          {governance.capabilityAlerts > 0 && <Link href="/skills" className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.1)", color: "var(--accent)" }}><ShieldCheck className="h-2.5 w-2.5" />{governance.capabilityAlerts} skill gap{governance.capabilityAlerts > 1 ? "s" : ""}</Link>}
        </div>
      )}

      {/* Detail side panel */}
      {selectedAgent && selectedPresence && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.15)" }} onClick={() => setSelectedAgent(null)} />
          <AgentDetailPanel agent={selectedAgent} presence={selectedPresence} signal={signals.get(selectedAgent.id)} tasks={tasks} events={events} departments={departments} projects={projects} onClose={() => setSelectedAgent(null)} />
        </>
      )}
    </PageShell>
  );
}
