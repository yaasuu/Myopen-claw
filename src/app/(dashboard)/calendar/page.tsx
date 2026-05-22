"use client";

import { useState, useMemo } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Repeat,
  Zap,
  List,
  LayoutGrid,
  AlignLeft,
  AlertTriangle,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

type ViewType = "month" | "week" | "agenda";
type FilterType = "all" | "routine" | "cron" | "governance";

interface RoutineEvent {
  id: string;
  title: string;
  type: "routine" | "cron" | "governance";
  frequency: "hourly" | "6h" | "daily" | "weekly" | "monthly";
  weekDay?: number; // 0=Sun, 1=Mon, etc. (for weekly)
  scheduleAddis: string;
  status: "active" | "paused";
  lastRun: string;
  nextRun: string;
}

const ROUTINES: RoutineEvent[] = [
  {
    id: "sync-daily",
    title: "Daily Team Sync (Auto)",
    type: "governance",
    frequency: "daily",
    scheduleAddis: "23:00 Daily",
    status: "active",
    lastRun: "Yesterday",
    nextRun: "Today at 23:00",
  },
  {
    id: "r1",
    title: "Daily Autonomy Check",
    type: "routine",
    frequency: "hourly",
    scheduleAddis: "Every hour",
    status: "active",
    lastRun: "Just now",
    nextRun: "In 30m",
  },
  {
    id: "r2",
    title: "Portfolio Health Check",
    type: "routine",
    frequency: "6h",
    scheduleAddis: "Every 6 hours",
    status: "active",
    lastRun: "3h ago",
    nextRun: "In 3h",
  },
  {
    id: "r3",
    title: "Nightly Summary Report",
    type: "governance",
    frequency: "daily",
    scheduleAddis: "23:05 Daily",
    status: "active",
    lastRun: "Yesterday",
    nextRun: "Today at 23:05",
  },
  {
    id: "r4",
    title: "Weekly Review",
    type: "governance",
    frequency: "weekly",
    weekDay: 1, // Monday
    scheduleAddis: "Mondays 09:00",
    status: "active",
    lastRun: "2 days ago",
    nextRun: "In 5 days",
  },
];

function getColor(type: RoutineEvent["type"]) {
  switch (type) {
    case "cron":
    case "routine":
      return "bg-[rgba(59,130,246,0.1)] text-[var(--info)] border-blue-200/20";
    case "governance":
      return "bg-[rgba(139,92,246,0.1)] text-violet-400 border-violet-200/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getShortColor(type: RoutineEvent["type"]) {
  switch (type) {
    case "cron":
    case "routine":
      return "bg-[rgba(59,130,246,0.15)] text-[var(--info)]";
    case "governance":
      return "bg-[rgba(139,92,246,0.15)] text-violet-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Returns routines that run on a specific date
function getRoutinesForDate(routines: RoutineEvent[], date: Date): RoutineEvent[] {
  const dayOfWeek = date.getDay();
  const dayOfMonth = date.getDate();
  return routines.filter((r) => {
    if (r.frequency === "hourly" || r.frequency === "6h") return true; // Every day
    if (r.frequency === "daily") return true;
    if (r.frequency === "weekly") return r.weekDay === dayOfWeek;
    if (r.frequency === "monthly") return dayOfMonth <= 5 || dayOfMonth >= 28; // First/last week approximation
    return false;
  });
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewType>("month");
  const [filter, setFilter] = useState<FilterType>("all");
  const [currentDate, setCurrentDate] = useState(new Date());

  const filteredRoutines = useMemo(() => {
    if (filter === "all") return ROUTINES;
    return ROUTINES.filter((r) => r.type === filter);
  }, [filter]);

  // Month navigation
  const navigateMonth = (dir: number) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + dir);
      return next;
    });
  };

  // Calendar Grid Logic
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Build grid cells (35 or 42 depending on month)
  const cellsNeeded = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const grid = Array.from({ length: cellsNeeded }, (_, i) => {
    const day = i - firstDay + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  // Build week dates (from current date's Sunday)
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Generate monthly events for the month view
  const monthEvents = useMemo(() => {
    const events: Record<number, RoutineEvent[]> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayRoutines = getRoutinesForDate(filteredRoutines, date);
      if (dayRoutines.length > 0) events[d] = dayRoutines;
    }
    return events;
  }, [year, month, filteredRoutines]);

  // Generate full agenda list (next 14 days)
  const agendaItems = useMemo(() => {
    const items: Array<{ date: Date; routines: RoutineEvent[] }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const routines = getRoutinesForDate(filteredRoutines, d);
      if (routines.length > 0) items.push({ date: d, routines });
    }
    return items;
  }, [filteredRoutines]);

  // Blocked tasks as calendar warnings (top 3)
  const blockedWarnings = [
    { title: "Orchestrator test", blocker: "Orchestrator test" },
    { title: "Create Export System", blocker: "Waiting on supplier confirmation" },
  ];

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>Calendar</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Operational timing · routines · cron jobs · governance milestones
          </p>
        </div>
      </div>

      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="action-bar">
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "var(--surface-muted)" }}>
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${view === "month" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="h-4 w-4" /> Month
            </button>
            <button
              onClick={() => setView("week")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${view === "week" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <AlignLeft className="h-4 w-4" /> Week
            </button>
            <button
              onClick={() => setView("agenda")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${view === "agenda" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <List className="h-4 w-4" /> Agenda
            </button>
          </div>

          <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="routine">Routines</SelectItem>
              <SelectItem value="cron">Cron Jobs</SelectItem>
              <SelectItem value="governance">Governance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-32 text-center">
            {currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
          </span>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Blocked Tasks Warning */}
      {blockedWarnings.length > 0 && (
        <Card className="stat-card mb-4 border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {blockedWarnings.length} Blocked Task{blockedWarnings.length > 1 ? "s" : ""} Affecting Schedule
              </span>
            </div>
            <div className="space-y-1">
              {blockedWarnings.map((b, i) => (
                <p key={i} className="text-xs text-muted-foreground">• {b.title} — {b.blocker}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month View */}
      {view === "month" && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--border)" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="p-2 text-xs font-semibold text-muted-foreground text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day, i) => {
              if (day === null) return <div key={i} className="h-20 border-b border-r" style={{ borderColor: "var(--border)" }} />;
              const dayEvents = monthEvents[day] || [];
              const isToday = isCurrentMonth && day === today.getDate();
              return (
                <div key={i} className={`h-20 border-b border-r p-1 transition-colors ${isToday ? "bg-muted/40" : "hover:bg-muted/20"}`} style={{ borderColor: "var(--border)" }}>
                  <span className={`text-xs font-medium ${isToday ? "text-[var(--accent)]" : ""}`}>{day}</span>
                  {dayEvents.length > 0 && (
                    <div className="mt-0.5 space-y-px">
                      {dayEvents.slice(0, 2).map(r => (
                        <div key={r.id} className={`text-[8px] leading-tight px-1 py-px rounded truncate ${getShortColor(r.type)}`}>
                          {r.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[8px] text-muted-foreground">+{dayEvents.length - 2} more</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {view === "week" && (
        <div className="space-y-3">
          {weekDates.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString();
            const dayRoutines = getRoutinesForDate(filteredRoutines, d);
            return (
              <Card key={i} className={isToday ? "border-l-4 border-l-[var(--accent)]" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">
                      {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                      {isToday && <Badge variant="outline" className="ml-2 text-[10px]">Today</Badge>}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{dayRoutines.length} events</span>
                  </div>
                  {dayRoutines.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {dayRoutines.map((r) => (
                        <div key={r.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${getColor(r.type)}`}>
                          {r.type === "governance" ? <Zap className="h-3 w-3" /> : <Repeat className="h-3 w-3" />}
                          <span>{r.title}</span>
                          <span className="opacity-60 ml-1">({r.scheduleAddis})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={CalendarIcon} title="No events" message="No routines scheduled for this day." className="py-6" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Agenda View */}
      {view === "agenda" && (
        <div className="space-y-4">
          {/* Upcoming Tasks Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Routines & Governance — Next 14 Days</h3>
            <div className="space-y-2">
              {agendaItems.map(({ date, routines }, idx) => {
                const isToday = date.toDateString() === today.toDateString();
                return (
                  <div key={idx} className="flex gap-3">
                    <div className="w-20 text-right pt-1">
                      <span className={`text-xs font-semibold ${isToday ? "text-[var(--accent)]" : "text-muted-foreground"}`}>
                        {isToday ? "Today" : date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="flex-1 space-y-1">
                      {routines.map(r => (
                        <div key={r.id} className="flex items-center gap-2 p-2 rounded-md border hover:bg-muted/30 transition-colors">
                          <div className={`h-2 w-2 rounded-full ${r.type === "governance" ? "bg-violet-400" : "bg-blue-400"}`} />
                          <span className="text-sm flex-1">{r.title}</span>
                          <span className="text-[10px] text-muted-foreground">{r.scheduleAddis}</span>
                          <Badge variant="outline" className={`text-[9px] ${getColor(r.type)}`}>{r.type}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Full Routines List */}
          <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">All Scheduled Operations</h3>
            <div className="space-y-2">
              {filteredRoutines.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border hover:border-[var(--border-strong)] transition-colors" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                      <CalendarIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{item.title}</h3>
                        <Badge variant="outline" className={`text-[10px] capitalize ${getColor(item.type)}`}>{item.type}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {item.scheduleAddis}</span>
                        <span className="flex items-center gap-1">Last: {item.lastRun}</span>
                        <span className="flex items-center gap-1 text-[var(--info)]">Next: {item.nextRun}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`h-2 w-2 rounded-full ${item.status === "active" ? "dot-green" : "dot-amber"}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
