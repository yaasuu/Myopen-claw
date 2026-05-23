"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database, Globe, Key, Bell, Bot, Activity,
  Cpu, CheckCircle2, Lock, Loader2, AlertCircle, Zap,
} from "lucide-react";

// ── Model catalogue ────────────────────────────────────────────────────────────
interface LLMModel {
  id: string;
  name: string;
  provider: string;          // "google" | "openrouter" | "openai"
  providerLabel: string;
  contextK: number;
  free: boolean;
  locked?: boolean;
  description: string;
  badge?: string;
  badgeColor?: string;
}

const MODELS: LLMModel[] = [
  // ── Google Gemini ──────────────────────────────────────────────────────────
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    providerLabel: "Google Gemini",
    contextK: 1000,
    free: true,
    description: "Fast reasoning model with 1M context. Best for daily ops.",
    badge: "Recommended",
    badgeColor: "var(--accent)",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    providerLabel: "Google Gemini",
    contextK: 1000,
    free: true,
    description: "Previous generation Gemini Flash — stable, well-tested.",
  },
  // ── OpenRouter Free ────────────────────────────────────────────────────────
  {
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B",
    provider: "openrouter",
    providerLabel: "OpenRouter Free",
    contextK: 128,
    free: true,
    description: "OpenAI open-source 120B. Reliable, tested in production today.",
    badge: "Tested",
    badgeColor: "var(--success)",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B",
    provider: "openrouter",
    providerLabel: "OpenRouter Free",
    contextK: 128,
    free: true,
    description: "Meta's best open-source model. Strong instruction following.",
  },
  {
    id: "deepseek/deepseek-v4-flash:free",
    name: "DeepSeek V4 Flash",
    provider: "openrouter",
    providerLabel: "OpenRouter Free",
    contextK: 1000,
    free: true,
    description: "1M context window. Excellent for large document analysis.",
    badge: "1M ctx",
    badgeColor: "var(--info)",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    name: "Hermes 3 — 405B",
    provider: "openrouter",
    providerLabel: "OpenRouter Free",
    contextK: 128,
    free: true,
    description: "The model Hermes is named after. 405B params — powerful.",
    badge: "Flagship",
    badgeColor: "var(--warning)",
  },
  {
    id: "qwen/qwen3-coder:free",
    name: "Qwen3 Coder 480B",
    provider: "openrouter",
    providerLabel: "OpenRouter Free",
    contextK: 1000,
    free: true,
    description: "Best free model for code-heavy tasks and structured output.",
    badge: "Best for code",
    badgeColor: "var(--info)",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nemotron Super 120B",
    provider: "openrouter",
    providerLabel: "OpenRouter Free",
    contextK: 1000,
    free: true,
    description: "NVIDIA's reasoning model with 1M context. Strong at analysis.",
  },
  {
    id: "deepseek/deepseek-r1:free",
    name: "DeepSeek R1",
    provider: "openrouter",
    providerLabel: "OpenRouter Free",
    contextK: 64,
    free: true,
    description: "Chain-of-thought reasoning model. Best for complex decisions.",
    badge: "Reasoning",
    badgeColor: "var(--accent)",
  },
  // ── OpenAI (locked) ────────────────────────────────────────────────────────
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    providerLabel: "OpenAI",
    contextK: 128,
    free: false,
    locked: true,
    description: "Budget OpenAI model. Fast and cost-effective. Requires API key.",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    providerLabel: "OpenAI",
    contextK: 128,
    free: false,
    locked: true,
    description: "Full OpenAI flagship model. Best quality. Requires API key.",
    badge: "Premium",
    badgeColor: "var(--text-muted)",
  },
];

const PROVIDER_GROUPS = [
  { key: "google",     label: "Google Gemini",    color: "#4285F4", dot: "🔵" },
  { key: "openrouter", label: "OpenRouter Free",   color: "var(--success)", dot: "🟢" },
  { key: "openai",     label: "OpenAI",            color: "var(--text-quiet)", dot: "🔒" },
];

// ── Static info sections ───────────────────────────────────────────────────────
const sections = [
  {
    title: "Database",
    icon: Database,
    items: [
      { label: "Provider",  value: "Supabase" },
      { label: "Status",    value: "Connected", status: "healthy" as const },
      { label: "Tables",    value: "agents, tasks, feed_events, org_nodes, system_status" },
    ],
  },
  {
    title: "Integrations",
    icon: Globe,
    items: [
      { label: "Supabase",        value: "Active" },
      { label: "Realtime",        value: "Enabled", status: "healthy" as const },
      { label: "Orchestrator API", value: "Active" },
    ],
  },
  {
    title: "API Keys",
    icon: Key,
    items: [
      { label: "Supabase URL",      value: "Configured ✓" },
      { label: "Supabase Anon Key", value: "Configured ✓" },
      { label: "Auth Mode",         value: "Anonymous (read/write)" },
    ],
  },
  {
    title: "Notifications",
    icon: Bell,
    items: [
      { label: "Realtime updates", value: "On" },
      { label: "Feed events",      value: "Active" },
      { label: "Alert routing",    value: "Automatic" },
    ],
  },
];

const statusColor = {
  healthy: "text-emerald-500",
  warning:  "text-[var(--warning)]",
  error:    "text-[var(--danger)]",
};

// ── LLM Switcher ──────────────────────────────────────────────────────────────
function LLMSwitcher() {
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [toast, setToast]               = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/hermes-model")
      .then((r) => r.json())
      .then((d) => { if (d.model) setCurrentModel(d.model); })
      .catch(() => {});
  }, []);

  async function selectModel(model: LLMModel) {
    if (model.locked || model.id === currentModel || saving) return;
    setSaving(true);
    setToast(null);
    const prev = currentModel;
    setCurrentModel(model.id); // optimistic
    try {
      const res = await fetch("/api/hermes-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed");
      setToast({ ok: true, msg: `Switched to ${model.name} · syncs in ~10 min` });
    } catch (err) {
      setCurrentModel(prev);
      setToast({ ok: false, msg: err instanceof Error ? err.message : "Switch failed" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const activeModel = MODELS.find((m) => m.id === currentModel);

  return (
    <div className="surface-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>AI Model</h3>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--text-quiet)" }} />}
        </div>
        {activeModel && (
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Active:</span>
            <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{activeModel.name}</span>
            <Zap className="h-3 w-3" style={{ color: "var(--accent)" }} />
          </div>
        )}
      </div>

      <CardContent className="p-5 space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium"
            style={{
              background: toast.ok ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)",
              color: toast.ok ? "var(--success)" : "var(--danger)",
              border: `1px solid ${toast.ok ? "rgba(16,185,129,0.2)" : "rgba(220,38,38,0.2)"}`,
            }}
          >
            {toast.ok
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              : <AlertCircle   className="h-3.5 w-3.5 shrink-0" />}
            {toast.msg}
          </div>
        )}

        {PROVIDER_GROUPS.map((group) => {
          const groupModels = MODELS.filter((m) => m.provider === group.key);
          return (
            <div key={group.key}>
              {/* Group label */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs">{group.dot}</span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--text-quiet)" }}
                >
                  {group.label}
                </span>
                {group.key === "openai" && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(148,163,184,0.1)", color: "var(--text-quiet)" }}
                  >
                    Requires API key
                  </span>
                )}
              </div>

              {/* Model cards grid */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groupModels.map((model) => {
                  const isActive  = model.id === currentModel;
                  const isLocked  = model.locked;

                  return (
                    <button
                      key={model.id}
                      disabled={isLocked || saving}
                      onClick={() => selectModel(model)}
                      className="text-left rounded-xl p-3.5 transition-all duration-150 border"
                      style={{
                        background: isActive
                          ? "rgba(99,102,241,0.08)"
                          : isLocked
                          ? "var(--surface-muted)"
                          : "var(--surface)",
                        borderColor: isActive
                          ? "var(--accent)"
                          : "var(--border)",
                        opacity: isLocked ? 0.55 : 1,
                        cursor: isLocked ? "not-allowed" : saving ? "wait" : "pointer",
                        boxShadow: isActive ? "0 0 0 1px var(--accent)" : "none",
                      }}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <span
                          className="text-xs font-semibold leading-tight"
                          style={{ color: isLocked ? "var(--text-muted)" : "var(--text)" }}
                        >
                          {model.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isActive && (
                            <CheckCircle2
                              className="h-3.5 w-3.5"
                              style={{ color: "var(--accent)" }}
                            />
                          )}
                          {isLocked && (
                            <Lock className="h-3 w-3" style={{ color: "var(--text-quiet)" }} />
                          )}
                        </div>
                      </div>

                      <p
                        className="text-[10px] leading-relaxed mb-2"
                        style={{ color: "var(--text-quiet)" }}
                      >
                        {model.description}
                      </p>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: "rgba(148,163,184,0.1)",
                            color: "var(--text-quiet)",
                          }}
                        >
                          {model.contextK}K ctx
                        </span>
                        {model.free && !isLocked && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                            style={{ background: "rgba(16,185,129,0.1)", color: "var(--success)" }}
                          >
                            Free
                          </span>
                        )}
                        {model.badge && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              background: `${model.badgeColor}18`,
                              color: model.badgeColor,
                            }}
                          >
                            {model.badge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
          Changes save to Supabase instantly and sync to Hermes within 10 minutes via the model-sync cron job.
        </p>
      </CardContent>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      description="System configuration, integrations, and agent overview"
    >
      {/* ── LLM Model Switcher (top) ── */}
      <LLMSwitcher />

      {/* ── Config grid ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="surface-card">
            <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <section.icon className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {section.title}
              </h3>
            </div>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--text-muted)" }}>{item.label}</span>
                    {item.status ? (
                      <Badge variant="outline" className={statusColor[item.status]}>
                        {item.value}
                      </Badge>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-quiet)" }}>
                        {item.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </div>
        ))}
      </div>

      {/* ── System Info ── */}
      <div className="surface-card">
        <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <Activity className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>System Info</h3>
        </div>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Version",        value: "1.0.0" },
              { label: "Framework",      value: "Next.js 15" },
              { label: "Environment",    value: "Production" },
              { label: "Design System",  value: "Mission Control" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>
                  {label}
                </p>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </div>
    </PageShell>
  );
}
