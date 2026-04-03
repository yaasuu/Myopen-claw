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
} from "lucide-react";

type ViewType = "month" | "week" | "agenda";
type FilterType = "all" | "routine" | "cron" | "governance";

interface RoutineEvent {
  id: string;
  title: string;
  type: "routine" | "cron" | "governance";
  frequency: "hourly" | "6h" | "daily" | "weekly" | "monthly";
  scheduleAddis: string;
  status: "active" | "paused";
  lastRun: string;
  nextRun: string;
}

const ROUTINES: RoutineEvent[] = [
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
    title: "Nightly Summary",
    type: "governance",
    frequency: "daily",
    scheduleAddis: "06:00 Daily",
    status: "active",
    lastRun: "Yesterday",
    nextRun: "Today at 23:00",
  },
  {
    id: "r4",
    title: "Weekly Review",
    type: "governance",
    frequency: "weekly",
    scheduleAddis: "Mondays 09:00",
    status: "active",
    lastRun: "2 days ago",
    nextRun: "In 5 days",
  },
  {
    id: "r5",
    title: "Monthly Strategy",
    type: "governance",
    frequency: "monthly",
    scheduleAddis: "1st of month",
    status: "active",
    lastRun: "15 days ago",
    nextRun: "In 15 days",
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

export default function CalendarPage() {
  const [view, setView] = useState<ViewType>("month");
  const [filter, setFilter] = useState<FilterType>("all");
  const [currentDate] = useState(new Date());

  const filteredRoutines = useMemo(() => {
    if (filter === "all") return ROUTINES;
    return ROUTINES.filter((r) => r.type === filter);
  }, [filter]);

  // Simple Calendar Grid Logic (Current Month)
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const grid = Array.from({ length: 35 }, (_, i) => {
    const day = i - firstDay + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  return (
    <PageShell title="Schedule & Calendar" description="Operational timing for the Yas Claw workforce">
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
          <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold min-w-32 text-center">
            {currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
          </span>
          <Button variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Month View */}
      {view === "month" && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--border)" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="p-2 text-xs font-semibold text-muted-foreground text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day, i) => (
              <div key={i} className="h-24 border-b border-r p-1 transition-colors hover:bg-muted/20" style={{ borderColor: "var(--border)" }}>
                {day && (
                  <>
                    <span className="text-xs font-medium">{day}</span>
                    {day === new Date().getDate() && (
                      <div className="mt-1 space-y-0.5">
                        {filteredRoutines.filter(r => r.frequency === "daily").map(r => (
                          <div key={r.id} className={`text-[9px] px-1 py-0.5 rounded truncate ${getColor(r.type)}`}>
                            {r.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Week View (Simple 7-day list) */}
      {view === "week" && (
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - d.getDay() + i);
            const isToday = i === new Date().getDay();
            return (
              <Card key={i} className={isToday ? "border-l-4 border-l-[var(--accent)]" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {filteredRoutines.map((r) => (
                      <div key={r.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${getColor(r.type)}`}>
                        {r.type === "governance" ? <Zap className="h-3 w-3" /> : <Repeat className="h-3 w-3" />}
                        <span>{r.title}</span>
                        <span className="opacity-60 ml-1">({r.scheduleAddis})</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Agenda View */}
      {view === "agenda" && (
        <div className="space-y-3">
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
      )}
    </PageShell>
  );
}
