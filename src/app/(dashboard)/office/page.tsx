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

// ═══════════════════════════════════════
// WARM BROWN COLOR PALETTE
// ═══════════════════════════════════════
// These are BRIGHT enough to be visible on dark background
const C = {
  floor: "#8B7355",           // WARM WOOD BROWN — very visible
  floorDark: "#7A6548",       // slightly darker for grid
  wall: "#5C4D3D",            // warm brown walls
  desk: "#A08060",            // LIGHT OAK — clearly wood
  deskFrame: "#8B7355",       // desk frame
  deskLeg: "#6B5D50",         // desk legs
  chair: "#5C4033",           // DARK LEATHER
  chairBack: "#4A3328",       // chair back
  chairLeg: "#3D2D22",        // chair legs
  monitor: "#2A2218",         // dark screen
  monitorFrame: "#1A1510",    // monitor frame
  meetingTable: "#6B4226",    // DARK WOOD
  meetingEdge: "#7A5030",     // meeting edge
  meetingPedestal: "#4A3020", // meeting pedestal
  reviewDesk: "#A08060",      // same as regular desk
  attentionDesk: "#8B6050",   // reddish wood
  receptionDesk: "#A08060",   // same as desk
  label: "#E8D8C0",           // warm cream label
  bg: "#1A1510",              // canvas background (dark warm)
};

// ═══════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════
// Room: 30x22
// Entrances at z=11 (top)
// Back wall at z=-11

const DEPT_POSITIONS: Record<string, [number, number, number]> = {
  "export-growth": [-6, 0, 2],
  "ops-improvement": [0, 0, 4],
  "architecture-systems": [6, 0, 2],
  "direct": [0, 0, -3],
};

const DESK_OFFSETS: [number, number, number][] = [
  [-1.3, 0, -0.7], [0, 0, -0.7], [1.3, 0, -0.7],
  [-1.3, 0, 0.7], [0, 0, 0.7], [1.3, 0, 0.7],
];

const MEETING_POS: [number, number, number] = [0, 0, -7];   // FAR from agents
const REVIEW_POS: [number, number, number] = [8, 0, -4];
const ATTENTION_POS: [number, number, number] = [-8, 0, -4];
const ORCHESTRATOR_POS: [number, number, number] = [0, 0, 0];
const RECEPTION_POS: [number, number, number] = [0, 0, 9];
const DINING_POS: [number, number, number] = [-8, 0, 6];
const LOUNGE_POS: [number, number, number] = [8, 0, 6];

const MEETING_SLOTS: [number, number, number][] = [
  [-1.3, 0, -0.5], [0, 0, -0.5], [1.3, 0, -0.5],
  [-1.3, 0, 0.5], [0, 0, 0.5], [1.3, 0, 0.5],
];
const REVIEW_SLOTS: [number, number, number][] = [[-0.9, 0, 0.9], [0, 0, 0.9], [0.9, 0, 0.9]];
const ATTENTION_SLOTS: [number, number, number][] = [[-0.7, 0, 0.8], [0, 0, 0.8], [0.7, 0, 0.8]];

function getTargetZone(state: PresenceState): string {
  if (state === "in_discussion") return "meeting";
  if (state === "in_review" || state === "waiting_for_input") return "review";
  if (state === "blocked") return "attention";
  return "desk";
}

function getSlotPosition(zone: string, slotIndex: number): [number, number, number] {
  let slots, base;
  if (zone === "meeting") { slots = MEETING_SLOTS; base = MEETING_POS; }
  else if (zone === "review") { slots = REVIEW_SLOTS; base = REVIEW_POS; }
  else if (zone === "attention") { slots = ATTENTION_SLOTS; base = ATTENTION_POS; }
  else return [0, 0, 0];
  const slot = slots[slotIndex % slots.length];
  return [base[0] + slot[0], 0, base[2] + slot[2]];
}

function computeHomePositions(agents: Agent[]): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  const deptCounts: Record<string, number> = {};
  for (const agent of agents) {
    const slug = getAgentDeptSlug(agent);
    const pos = DEPT_POSITIONS[slug] ?? DEPT_POSITIONS["direct"];
    const idx = deptCounts[slug] ?? 0;
    deptCounts[slug] = idx + 1;
    const off = DESK_OFFSETS[idx % DESK_OFFSETS.length];
    positions.set(agent.id, [pos[0] + off[0], 0, pos[2] + off[2]]);
  }
  return positions;
}

function assignSlots(agents: Agent[], presences: AgentPresence[]): Map<string, number> {
  const groups: Record<string, string[]> = {};
  for (const a of agents) {
    const p = presences.find((p) => p.agentId === a.id);
    const zone = getTargetZone(p?.state ?? "available");
    if (zone === "desk") continue;
    if (!groups[zone]) groups[zone] = [];
    groups[zone].push(a.id);
  }
  const map = new Map<string, number>();
  for (const [, ids] of Object.entries(groups)) {
    [...ids].sort().forEach((id, i) => map.set(id, i));
  }
  return map;
}

function getDotColor(state: PresenceState): string {
  if (state === "working") return "#3b82f6";
  if (state === "in_discussion") return "#8b5cf6";
  if (state === "in_review" || state === "waiting_for_input") return "#f59e0b";
  if (state === "blocked") return "#ef4444";
  if (state === "available") return "#22c55e";
  return "#6b7280";
}

function getDeptColor(slug: string): string {
  if (slug === "export-growth") return "#3b82f6";
  if (slug === "ops-improvement") return "#f59e0b";
  if (slug === "architecture-systems") return "#8b5cf6";
  return "#22c55e";
}

// ═══════════════════════════════════════
// 3D COMPONENTS
// ═══════════════════════════════════════

function Room() {
  return (
    <group>
      {/* FLOOR — WARM BROWN, clearly visible */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[30, 22]} />
        <meshStandardMaterial color={C.floor} roughness={0.9} />
      </mesh>
      {/* Grid lines on floor */}
      <gridHelper args={[30, 15, C.floorDark, C.floorDark]} position={[0, -0.04, 0]} />

      {/* Walls */}
      <mesh position={[0, 2.5, -11]} receiveShadow>
        <boxGeometry args={[30, 5, 0.2]} />
        <meshStandardMaterial color={C.wall} />
      </mesh>
      <mesh position={[-15, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[22, 5, 0.2]} />
        <meshStandardMaterial color={C.wall} />
      </mesh>
      <mesh position={[15, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[22, 5, 0.2]} />
        <meshStandardMaterial color={C.wall} />
      </mesh>
      {/* Entrance walls */}
      <mesh position={[-8, 2.5, 11]} receiveShadow>
        <boxGeometry args={[14, 5, 0.2]} />
        <meshStandardMaterial color={C.wall} />
      </mesh>
      <mesh position={[8, 2.5, 11]} receiveShadow>
        <boxGeometry args={[14, 5, 0.2]} />
        <meshStandardMaterial color={C.wall} />
      </mesh>

      {/* Floor pads */}
      {Object.entries(DEPT_POSITIONS).map(([slug, pos]) => (
        <group key={slug}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], 0.003, pos[2]]}>
            <circleGeometry args={[3.2, 6]} />
            <meshStandardMaterial color={getDeptColor(slug)} transparent opacity={0.1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], 0.006, pos[2]]}>
            <ringGeometry args={[2.9, 3.2, 6]} />
            <meshStandardMaterial color={getDeptColor(slug)} transparent opacity={0.25} />
          </mesh>
        </group>
      ))}
      {/* Meeting pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MEETING_POS[0], 0.003, MEETING_POS[2]]}>
        <circleGeometry args={[2.8, 6]} />
        <meshStandardMaterial color="#8b5cf6" transparent opacity={0.08} />
      </mesh>
      {/* Review pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[REVIEW_POS[0], 0.003, REVIEW_POS[2]]}>
        <circleGeometry args={[2.5, 6]} />
        <meshStandardMaterial color="#f59e0b" transparent opacity={0.08} />
      </mesh>
      {/* Attention pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ATTENTION_POS[0], 0.003, ATTENTION_POS[2]]}>
        <circleGeometry args={[2.2, 6]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.06} />
      </mesh>
      {/* Reception pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[RECEPTION_POS[0], 0.003, RECEPTION_POS[2]]}>
        <circleGeometry args={[3, 6]} />
        <meshStandardMaterial color="#b8a080" transparent opacity={0.05} />
      </mesh>
      {/* Dining pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[DINING_POS[0], 0.003, DINING_POS[2]]}>
        <circleGeometry args={[2.5, 6]} />
        <meshStandardMaterial color="#a08060" transparent opacity={0.06} />
      </mesh>
      {/* Lounge pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LOUNGE_POS[0], 0.003, LOUNGE_POS[2]]}>
        <circleGeometry args={[2.5, 6]} />
        <meshStandardMaterial color="#6080a0" transparent opacity={0.05} />
      </mesh>
    </group>
  );
}

// ─── Desk (LIGHT OAK with DARK LEATHER chair) ───

function Desk({ position, color, label, occupied }: {
  position: [number, number, number]; color: string; label: string; occupied: boolean;
}) {
  return (
    <group position={position}>
      {/* Desk surface — LIGHT OAK */}
      <RoundedBox args={[1.6, 0.06, 0.9]} radius={0.02} position={[0, 0.75, 0]} castShadow>
        <meshStandardMaterial color={C.desk} roughness={0.55} />
      </RoundedBox>
      {/* Frame */}
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[1.65, 0.03, 0.95]} />
        <meshStandardMaterial color={C.deskFrame} />
      </mesh>
      {/* Legs */}
      {[[-0.7, 0, -0.35], [0.7, 0, -0.35], [-0.7, 0, 0.35], [0.7, 0, 0.35]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.375, p[2]]}>
          <boxGeometry args={[0.04, 0.75, 0.04]} />
          <meshStandardMaterial color={C.deskLeg} metalness={0.2} />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh position={[0, 1.05, -0.35]} castShadow>
        <boxGeometry args={[0.7, 0.45, 0.03]} />
        <meshStandardMaterial color={C.monitor} emissive={occupied ? color : "#000000"} emissiveIntensity={occupied ? 0.1 : 0} />
      </mesh>
      <mesh position={[0, 1.05, -0.36]}>
        <boxGeometry args={[0.72, 0.47, 0.01]} />
        <meshStandardMaterial color={C.monitorFrame} />
      </mesh>
      <mesh position={[0, 0.85, -0.25]}>
        <boxGeometry args={[0.06, 0.25, 0.06]} />
        <meshStandardMaterial color={C.deskLeg} />
      </mesh>
      {/* Chair — DARK LEATHER */}
      <mesh position={[0, 0.38, 0.6]}>
        <boxGeometry args={[0.4, 0.05, 0.4]} />
        <meshStandardMaterial color={C.chair} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.62, 0.78]}>
        <boxGeometry args={[0.4, 0.5, 0.05]} />
        <meshStandardMaterial color={C.chairBack} roughness={0.85} />
      </mesh>
      {[[-0.16, 0, 0.44], [0.16, 0, 0.44], [-0.16, 0, 0.76], [0.16, 0, 0.76]].map((lp, li) => (
        <mesh key={li} position={[lp[0], 0.19, lp[2]]}>
          <boxGeometry args={[0.03, 0.38, 0.03]} />
          <meshStandardMaterial color={C.chairLeg} metalness={0.3} />
        </mesh>
      ))}
      {/* Label */}
      <Text position={[0, 0.79, 0.42]} fontSize={0.08} color={C.label} anchorX="center" anchorY="middle">
        {label}
      </Text>
      {/* Status dot */}
      <mesh position={[0.7, 0.79, -0.35]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={occupied ? color : "#5a5045"} emissive={occupied ? color : "#000000"} emissiveIntensity={occupied ? 0.7 : 0} />
      </mesh>
    </group>
  );
}

function DeptCluster({ slug, label, color, agents: ca, homePositions, presences, onSelect }: {
  slug: string; label: string; color: string;
  agents: Agent[]; homePositions: Map<string, [number, number, number]>;
  presences: AgentPresence[]; onSelect: (a: Agent) => void;
}) {
  const pos = DEPT_POSITIONS[slug] ?? [0, 0, 0];
  return (
    <group position={pos}>
      <Text position={[0, 0.05, 3]} fontSize={0.18} color={color} anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]}>
        {label}
      </Text>
      {ca.map((agent, i) => {
        const off = DESK_OFFSETS[i % DESK_OFFSETS.length];
        const hp: [number, number, number] = [off[0], 0, off[2]];
        const p = presences.find((p) => p.agentId === agent.id);
        const occ = p ? p.state !== "paused" && p.state !== "offline" : false;
        return <group key={agent.id} onClick={() => onSelect(agent)}><Desk position={hp} color={color} label={agent.name.split(" ")[0]} occupied={occ} /></group>;
      })}
    </group>
  );
}

function MeetingTable() {
  return (
    <group position={MEETING_POS}>
      {/* Round table — DARK WOOD */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[1.4, 1.4, 0.08, 24]} />
        <meshStandardMaterial color={C.meetingTable} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <torusGeometry args={[1.4, 0.03, 8, 24]} />
        <meshStandardMaterial color={C.meetingEdge} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 0.8, 12]} />
        <meshStandardMaterial color={C.meetingPedestal} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 12]} />
        <meshStandardMaterial color={C.meetingPedestal} />
      </mesh>
      <Text position={[0, 0.92, 0]} fontSize={0.13} color="#c4a0ff" anchorX="center" anchorY="middle">
        Meeting
      </Text>
      {/* Chairs — DARK LEATHER, facing center */}
      {MEETING_SLOTS.map((slot, i) => {
        const angle = Math.atan2(slot[0], slot[2]);
        return (
          <group key={i} position={slot} rotation={[0, angle + Math.PI, 0]}>
            <mesh position={[0, 0.38, 0]}>
              <boxGeometry args={[0.38, 0.05, 0.38]} />
              <meshStandardMaterial color={C.chair} roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.6, 0.18]}>
              <boxGeometry args={[0.38, 0.45, 0.05]} />
              <meshStandardMaterial color={C.chairBack} roughness={0.85} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function ReviewArea() {
  return (
    <group position={REVIEW_POS}>
      <RoundedBox args={[2, 0.06, 1]} radius={0.03} position={[0, 0.75, 0]} castShadow>
        <meshStandardMaterial color={C.reviewDesk} roughness={0.55} />
      </RoundedBox>
      {[[-0.8, 0, -0.35], [0.8, 0, -0.35], [-0.8, 0, 0.35], [0.8, 0, 0.35]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.375, p[2]]}><boxGeometry args={[0.05, 0.75, 0.05]} /><meshStandardMaterial color={C.deskLeg} /></mesh>
      ))}
      <mesh position={[0, 1.05, -0.35]}><boxGeometry args={[0.5, 0.35, 0.03]} /><meshStandardMaterial color={C.monitor} emissive="#f59e0b" emissiveIntensity={0.08} /></mesh>
      <Text position={[0, 0.88, 0.45]} fontSize={0.12} color="#f5c060" anchorX="center" anchorY="middle">Review</Text>
      <mesh position={[0, 0.38, 0.6]}><boxGeometry args={[0.35, 0.05, 0.35]} /><meshStandardMaterial color={C.chair} /></mesh>
      <mesh position={[0, 0.6, 0.75]}><boxGeometry args={[0.35, 0.45, 0.05]} /><meshStandardMaterial color={C.chairBack} /></mesh>
    </group>
  );
}

function AttentionArea() {
  return (
    <group position={ATTENTION_POS}>
      <RoundedBox args={[1.5, 0.06, 0.8]} radius={0.03} position={[0, 0.75, 0]} castShadow>
        <meshStandardMaterial color={C.attentionDesk} roughness={0.55} />
      </RoundedBox>
      {[[-0.6, 0, -0.3], [0.6, 0, -0.3], [-0.6, 0, 0.3], [0.6, 0, 0.3]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.375, p[2]]}><boxGeometry args={[0.04, 0.75, 0.04]} /><meshStandardMaterial color={C.deskLeg} /></mesh>
      ))}
      <mesh position={[0, 1, -0.3]}><boxGeometry args={[0.45, 0.3, 0.03]} /><meshStandardMaterial color={C.monitor} emissive="#ef4444" emissiveIntensity={0.08} /></mesh>
      <Text position={[0, 0.88, 0.35]} fontSize={0.12} color="#ff8080" anchorX="center" anchorY="middle">Attention</Text>
      <mesh position={[0, 0.38, 0.45]}><boxGeometry args={[0.3, 0.05, 0.3]} /><meshStandardMaterial color="#6B4540" /></mesh>
      <mesh position={[0, 0.58, 0.58]}><boxGeometry args={[0.3, 0.4, 0.05]} /><meshStandardMaterial color="#5A3830" /></mesh>
    </group>
  );
}

function Reception() {
  return (
    <group position={RECEPTION_POS}>
      <RoundedBox args={[3.5, 0.8, 0.7]} radius={0.04} position={[0, 0.4, 0]} castShadow>
        <meshStandardMaterial color={C.receptionDesk} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[3.6, 0.04, 0.8]} radius={0.02} position={[0, 0.82, 0]} castShadow>
        <meshStandardMaterial color="#B89870" roughness={0.45} />
      </RoundedBox>
      <Text position={[0, 0.95, -0.2]} fontSize={0.14} color={C.label} anchorX="center" anchorY="middle">Reception</Text>
    </group>
  );
}

function DiningArea() {
  return (
    <group position={DINING_POS}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 0.06, 16]} />
        <meshStandardMaterial color="#8B7355" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.1, 0.15, 0.75, 8]} />
        <meshStandardMaterial color={C.deskLeg} />
      </mesh>
      {([[-0.7, 0, 0], [0.7, 0, 0], [0, 0, -0.7], [0, 0, 0.7]] as [number,number,number][]).map((pos, i) => {
        const angle = Math.atan2(pos[0], pos[2]);
        return (
          <group key={i} position={pos} rotation={[0, angle + Math.PI, 0]}>
            <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.35, 0.04, 0.35]} /><meshStandardMaterial color={C.chair} /></mesh>
            <mesh position={[0, 0.55, 0.16]}><boxGeometry args={[0.35, 0.4, 0.04]} /><meshStandardMaterial color={C.chairBack} /></mesh>
          </group>
        );
      })}
      <Text position={[0, 0.88, 0]} fontSize={0.1} color="#c4a060" anchorX="center" anchorY="middle">☕ Break</Text>
    </group>
  );
}

function LoungeArea() {
  return (
    <group position={LOUNGE_POS}>
      <RoundedBox args={[2, 0.4, 0.7]} radius={0.08} position={[0, 0.2, 0]} castShadow>
        <meshStandardMaterial color="#4A5565" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[2, 0.5, 0.15]} radius={0.06} position={[0, 0.55, -0.3]} castShadow>
        <meshStandardMaterial color="#4A5565" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.15, 0.35, 0.7]} radius={0.06} position={[-0.95, 0.38, 0]}><meshStandardMaterial color="#4A5565" roughness={0.9} /></RoundedBox>
      <RoundedBox args={[0.15, 0.35, 0.7]} radius={0.06} position={[0.95, 0.38, 0]}><meshStandardMaterial color="#4A5565" roughness={0.9} /></RoundedBox>
      <RoundedBox args={[0.8, 0.04, 0.5]} radius={0.02} position={[0, 0.45, 0.8]} castShadow>
        <meshStandardMaterial color={C.desk} roughness={0.5} />
      </RoundedBox>
      <Text position={[0, 0.1, 1.3]} fontSize={0.1} color="#80a0c0" anchorX="center" anchorY="middle">Lounge</Text>
    </group>
  );
}

function Orchestrator({ coordination }: { coordination: CoordinationState }) {
  return (
    <group position={ORCHESTRATOR_POS}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[2.2, 6]} />
        <meshStandardMaterial color="#22C7B8" transparent opacity={0.1} />
      </mesh>
      <RoundedBox args={[2.2, 0.1, 1.3]} radius={0.06} position={[0, 0.8, 0]} castShadow>
        <meshStandardMaterial color="#3A5050" roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[2.3, 0.12, 1.4]} radius={0.06} position={[0, 0.79, 0]}>
        <meshStandardMaterial color="#22C7B8" transparent opacity={0.3} />
      </RoundedBox>
      <mesh position={[0, 1.2, -0.5]} castShadow>
        <boxGeometry args={[1, 0.6, 0.04]} />
        <meshStandardMaterial color="#0a1a20" emissive="#22C7B8" emissiveIntensity={0.08} />
      </mesh>
      <Text position={[0, 1, 0.5]} fontSize={0.2} color="#40E8D8" anchorX="center" anchorY="middle">🦀 Yas Claw</Text>
      <Text position={[0, 0.95, 0.55]} fontSize={0.09} color="#22C7B8" anchorX="center" anchorY="middle">ORCHESTRATOR</Text>
      {coordination.isCoordinating && (
        <mesh position={[0.9, 1.1, -0.4]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={1} />
        </mesh>
      )}
    </group>
  );
}

function ConnectionLines() {
  const lines = useMemo(() => {
    const result: { points: [THREE.Vector3, THREE.Vector3] }[] = [];
    for (const pos of Object.values(DEPT_POSITIONS)) {
      result.push({ points: [new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(pos[0], 0.5, pos[2])] });
    }
    result.push({ points: [new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(MEETING_POS[0], 0.5, MEETING_POS[2])] });
    return result;
  }, []);
  return <group>{lines.map((l, i) => <Line key={i} points={l.points} color="#22C7B8" lineWidth={1} opacity={0.1} transparent />)}</group>;
}

// ─── Agent ───

function Agent3D({ agent, presence, homePosition, slotMap, govSignals, onClick }: {
  agent: Agent; presence: AgentPresence | undefined;
  homePosition: [number, number, number]; slotMap: Map<string, number>;
  govSignals: GovernanceSignal[]; onClick: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const target = useRef<[number, number, number]>([...homePosition]);
  const cur = useRef<[number, number, number]>([...homePosition]);
  const face = useRef(0);
  const bob = useRef(0);
  const sit = useRef(0);

  const state = presence?.state ?? "available";
  const dot = getDotColor(state);
  const away = state === "paused" || state === "offline";
  const alert = govSignals.some((s) => s.severity === "critical" || s.severity === "attention");
  const zone = getTargetZone(state);
  const shouldSit = zone === "desk";

  useEffect(() => {
    if (zone === "desk") target.current = [...homePosition];
    else target.current = getSlotPosition(zone, slotMap.get(agent.id) ?? 0);
  }, [state, homePosition, slotMap, agent.id, zone]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const dx = target.current[0] - cur.current[0];
    const dz = target.current[2] - cur.current[2];
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.08) {
      const ease = Math.min(1, d / 2);
      const spd = 2.2 * (0.3 + 0.7 * ease);
      const step = Math.min(spd * dt, d);
      cur.current[0] += (dx / d) * step;
      cur.current[2] += (dz / d) * step;
      ref.current.position.set(cur.current[0], 0, cur.current[2]);
      const ma = Math.atan2(dx, dz);
      let ad = ma - face.current;
      while (ad > Math.PI) ad -= 2 * Math.PI;
      while (ad < -Math.PI) ad += 2 * Math.PI;
      face.current += ad * Math.min(1, dt * 8);
      ref.current.rotation.y = face.current;
      bob.current += dt * 7 * (spd / 2.2);
      ref.current.position.y = Math.abs(Math.sin(bob.current)) * 0.035;
      sit.current = Math.max(0, sit.current - dt * 4);
    } else {
      bob.current = 0;
      sit.current = shouldSit ? Math.min(1, sit.current + dt * 2.5) : Math.max(0, sit.current - dt * 3.5);
      ref.current.position.y = -sit.current * 0.2;
      let ft: [number, number] = [0, 0];
      if (zone === "desk") ft = [homePosition[0], homePosition[2] - 0.5];
      else if (zone === "meeting") ft = [MEETING_POS[0], MEETING_POS[2]];
      else if (zone === "review") ft = [REVIEW_POS[0], REVIEW_POS[2]];
      else if (zone === "attention") ft = [ATTENTION_POS[0], ATTENTION_POS[2]];
      const fdx = ft[0] - cur.current[0], fdz = ft[1] - cur.current[2];
      const ta = Math.atan2(fdx, fdz);
      let ad = ta - face.current;
      while (ad > Math.PI) ad -= 2 * Math.PI;
      while (ad < -Math.PI) ad += 2 * Math.PI;
      face.current += ad * Math.min(1, dt * 4);
      ref.current.rotation.y = face.current;
    }
  });

  const cfg = presence ? getPresenceConfig(presence.state) : null;

  return (
    <group ref={ref} position={[homePosition[0], 0, homePosition[2]]} onClick={onClick}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.5, 8, 16]} />
        <meshStandardMaterial color={away ? "#5a5045" : "#4A3C2E"} transparent={away} opacity={away ? 0.4 : 1} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[0.35, 0.06, 0.18]} />
        <meshStandardMaterial color={away ? "#5a5045" : "#4A3C2E"} transparent={away} opacity={away ? 0.4 : 1} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color={away ? "#6b6055" : "#E8D8C0"} transparent={away} opacity={away ? 0.4 : 1} />
      </mesh>
      <mesh position={[0.15, 0.9, -0.08]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={dot} emissive={dot} emissiveIntensity={0.6} />
      </mesh>
      {alert && <mesh position={[-0.15, 0.9, -0.08]}><sphereGeometry args={[0.035, 8, 8]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} /></mesh>}
      <Text position={[0, 1.35, 0]} fontSize={0.1} color="#F5F0E8" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">{agent.emoji} {agent.name.split(" ")[0]}</Text>
      <Text position={[0, 1.22, 0]} fontSize={0.065} color={dot} anchorX="center" anchorY="middle" outlineWidth={0.005} outlineColor="#000">{cfg?.label ?? state}</Text>
    </group>
  );
}

// ═══════════════════════════════════════
// DETAIL PANEL
// ═══════════════════════════════════════

const EVT: Record<string, { color: string; label: string }> = {
  task_created: { color: "var(--info)", label: "Created" },
  task_updated: { color: "var(--text-quiet)", label: "Updated" },
  task_completed: { color: "var(--success)", label: "Completed" },
  agent_routed: { color: "var(--info)", label: "Routed" },
  blocker_detected: { color: "var(--danger)", label: "Blocker" },
};

function DetailPanel({ agent, presence, signal, tasks, events, departments, projects, onClose }: {
  agent: Agent; presence: AgentPresence; signal: CollaborationSignal | undefined;
  tasks: TaskWithAgent[]; events: FeedEvent[]; departments: Department[]; projects: Project[];
  onClose: () => void;
}) {
  const cfg = getPresenceConfig(presence.state);
  const all = tasks.filter((t) => t.assigned_agent_id === agent.id);
  const open = all.filter((t) => t.status !== "done");
  const evts = events.filter((e) => e.related_agent_id === agent.id).slice(0, 8);
  const dept = departments.find((d) => d.slug === (agent as any).department_slug);
  const dl = dept ? dept.name : DIRECT_SHORT_IDS.includes(agent.short_id) ? "Direct" : "Unassigned";
  const today = new Date().toISOString().slice(0, 10);
  const done = all.filter((t) => t.status === "done" && t.updated_at?.slice(0, 10) === today).length;
  const prog = all.filter((t) => t.status === "in-progress").length;
  const rev = all.filter((t) => t.status === "in-review").length;
  const blk = all.filter((t) => t.status === "blocked").length;
  const pt = open.find((t) => t.status === "in-progress") ?? open[0] ?? null;
  const wt = open.find((t) => t.status === "in-review");
  const bt = open.find((t) => t.status === "blocked");
  const proj = pt?.project_id ? projects.find((p) => p.id === pt.project_id) : null;

  return (
    <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto" style={{ width: "min(380px, 92vw)", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "0 0 20px rgba(0,0,0,0.1)" }}>
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="relative"><span className="text-2xl">{agent.emoji}</span><div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${cfg?.dot ?? "dot-gray"}`} style={{ borderColor: "var(--surface)" }} /></div>
          <div><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{agent.name}</p><p className="text-[11px]" style={{ color: "var(--text-quiet)" }}>{dl}</p></div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: "var(--text-quiet)" }}><X className="h-4 w-4" /></button>
      </div>
      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-1"><div className={`h-2 w-2 rounded-full ${cfg?.dot ?? "dot-gray"}`} /><span className="text-xs font-semibold" style={{ color: cfg?.color ?? "var(--text-quiet)" }}>{cfg?.label ?? presence.state}</span></div>
        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Last: {presence.lastActivity ? timeAgo(presence.lastActivity) : "None"}</p>
      </div>
      <div className="p-4 grid grid-cols-3 gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: done > 0 ? "var(--success)" : "var(--text)" }}>{done}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Done</p></div>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: "var(--text)" }}>{prog}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Active</p></div>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: rev > 0 ? "var(--warning)" : "var(--text)" }}>{rev}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Review</p></div>
      </div>
      {(pt || wt || bt) && (
        <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Current Context</p>
          <div className="flex flex-col gap-2">
            {pt && <Link href="/tasks" className="p-2 rounded hover:opacity-80" style={{ background: "var(--surface-muted)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-quiet)" }}>Working on</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{pt.title}</p></Link>}
            {wt && <Link href="/reviews" className="p-2 rounded hover:opacity-80" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--warning)" }}>Awaiting review</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{wt.title}</p></Link>}
            {bt && <div className="p-2 rounded" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--danger)" }}>Blocked</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{bt.title}</p>{bt.blocker && <p className="text-[10px] mt-1" style={{ color: "var(--text-quiet)" }}>{bt.blocker}</p>}</div>}
            {proj && <Link href={`/projects/${proj.id}`} className="p-2 rounded hover:opacity-80" style={{ background: "var(--surface-muted)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-quiet)" }}>Project</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{proj.title}</p></Link>}
          </div>
        </div>
      )}
      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-quiet)" }}>Timeline</p>
        {evts.length === 0 ? <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>No activity</p> : (
          <div className="flex flex-col gap-0">{evts.map((e, i) => { const c = EVT[e.event_type] ?? { color: "var(--text-quiet)", label: e.event_type }; return (
            <div key={e.id} className="flex gap-2">
              <div className="flex flex-col items-center"><div className="mt-1 h-3 w-3 rounded-full" style={{ background: c.color + "30", border: `1px solid ${c.color}` }} />{i < evts.length - 1 && <div className="w-px flex-1" style={{ background: "var(--border)" }} />}</div>
              <div className="pb-2 flex-1 min-w-0"><p className="text-[10px] truncate" style={{ color: "var(--text)" }}>{e.summary}</p><p className="text-[9px]" style={{ color: "var(--text-quiet)" }}>{timeAgo(e.created_at)}</p></div>
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
// PAGE
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
      const pl = a.data.map((ag) => deriveAgentPresence(ag, t.data, e.data));
      setPresences(pl);
      const ids = a.data.map((ag) => ag.id);
      const cs = computeCollaborationSignals(e.data, ids);
      setSignals(cs); setCoordination(computeCoordinationState(e.data, ids));
      const { getAllTaskReviews } = await import("@/lib/data/reviews");
      const [rr, gr] = await Promise.all([getAllTaskReviews(100), getCapabilityGaps({ limit: 50 })]);
      const ro = rr.data.map((r) => ({ task_id: r.task_id, outcome: r.outcome }));
      const gf = gr.data.map((g) => ({ agent_id: (g as any).agent_id ?? null, urgency_level: (g as any).urgency_level ?? "low", composite_score: (g as any).composite_score ?? 0 }));
      setGovernance(computeOrchestratorGovernance(a.data, t.data, e.data, ro, gf));
    } catch (err) { console.error("Office load error:", err); } finally { setLoading(false); }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "tasks", "feed_events"], loadRef);
  useEffect(() => { const i = setInterval(() => load(), 10000); return () => clearInterval(i); }, []);
  useEffect(() => { load(); }, []);

  const hp = useMemo(() => computeHomePositions(agents), [agents]);
  const sm = useMemo(() => assignSlots(agents, presences), [agents, presences]);
  const wc = presences.filter((p) => p.state === "working").length;
  const dc = presences.filter((p) => p.state === "in_discussion").length;
  const rc = presences.filter((p) => p.state === "in_review" || p.state === "waiting_for_input").length;
  const bc = presences.filter((p) => p.state === "blocked").length;
  const ac = presences.filter((p) => p.state === "paused" || p.state === "offline").length;

  if (loading) return <PageShell title="Office" description="Loading..."><div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading office...</div></PageShell>;

  const sp = selectedAgent ? presences.find((p) => p.agentId === selectedAgent.id) : null;

  return (
    <PageShell title="Office" description="3D living office">
      {/* Executive strip */}
      <div className="rounded-lg p-3 mb-4 flex items-center gap-3 overflow-x-auto text-xs" style={{ background: "var(--background)", border: "1px solid var(--border)", WebkitOverflowScrolling: "touch" }}>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} /><span style={{ color: "var(--text-quiet)" }}>Online {presences.filter((p) => p.state !== "paused" && p.state !== "offline").length}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--info)" }} /><span style={{ color: "var(--text-quiet)" }}>Work {wc}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} /><span style={{ color: "var(--text-quiet)" }}>Talk {dc}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--warning)" }} /><span style={{ color: "var(--text-quiet)" }}>Review {rc}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ color: "var(--danger)" }} /><span style={{ color: "var(--text-quiet)" }}>Blocked {bc}</span></div>
        {ac > 0 && <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--text-muted)" }} /><span style={{ color: "var(--text-quiet)" }}>Away {ac}</span></div>}
        <div className="flex gap-1.5 ml-auto shrink-0">
          <Link href="/reviews" className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Reviews</Link>
          <Link href="/tasks" className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Tasks</Link>
        </div>
        <div className="flex items-center gap-1.5 shrink-0"><div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} /><span style={{ color: "var(--text-quiet)" }}>live</span></div>
      </div>

      {/* 3D Canvas — BROWN BACKGROUND */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", height: "68vh", background: C.bg }}>
        <Canvas shadows camera={{ position: [8, 8, 18], fov: 50 }} style={{ background: C.bg }}>
          <ambientLight intensity={0.25} />
          <directionalLight position={[8, 12, 8]} intensity={0.5} castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-6, 8, -4]} intensity={0.15} color="#d4c4a0" />
          <pointLight position={[0, 4, 0]} intensity={0.35} color="#22C7B8" distance={15} />
          <pointLight position={[MEETING_POS[0], 3, MEETING_POS[2]]} intensity={0.15} color="#a080ff" distance={8} />
          <pointLight position={[DINING_POS[0], 2.5, DINING_POS[2]]} intensity={0.1} color="#c4a060" distance={6} />

          <Room />
          <Orchestrator coordination={coordination} />
          <ConnectionLines />
          <MeetingTable />
          <ReviewArea />
          <AttentionArea />
          <Reception />
          <DiningArea />
          <LoungeArea />

          {[
            { slug: "export-growth", label: "Export-Growth", color: "#3b82f6" },
            { slug: "ops-improvement", label: "Ops-Improvement", color: "#f59e0b" },
            { slug: "architecture-systems", label: "Architecture", color: "#8b5cf6" },
            { slug: "direct", label: "Direct", color: "#22c55e" },
          ].map((d) => (
            <DeptCluster key={d.slug} slug={d.slug} label={d.label} color={d.color} agents={agents.filter((a) => getAgentDeptSlug(a) === d.slug)} homePositions={hp} presences={presences} onSelect={setSelectedAgent} />
          ))}

          {agents.map((a) => (
            <Agent3D key={a.id} agent={a} presence={presences.find((p) => p.agentId === a.id)} homePosition={hp.get(a.id) ?? [0, 0, 0]} slotMap={sm} govSignals={governance.signals.filter((gs) => gs.agentId === a.id)} onClick={() => setSelectedAgent(a)} />
          ))}

          <OrbitControls enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.2} minDistance={5} maxDistance={35} target={[0, 0, 0]} />
        </Canvas>
      </div>

      {selectedAgent && sp && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.15)" }} onClick={() => setSelectedAgent(null)} />
          <DetailPanel agent={selectedAgent} presence={sp} signal={signals.get(selectedAgent.id)} tasks={tasks} events={events} departments={departments} projects={projects} onClose={() => setSelectedAgent(null)} />
        </>
      )}
    </PageShell>
  );
}
