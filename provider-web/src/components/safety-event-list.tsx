import { AlertTriangle, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDateTimeKo } from "@/lib/format"
import { SAFETY_EVENT_LABELS, type SafetyGrade } from "@/lib/safety"
import type { SafetyEvent } from "@/mocks/fixtures"

export function SafetyEventList({ events }: { events: SafetyEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        최근 30일 안전 이벤트 없음.
      </p>
    )
  }
  const a = events.filter((e) => e.grade === "A")
  const b = events.filter((e) => e.grade === "B")
  return (
    <div className="grid gap-4">
      {a.length > 0 && (
        <SectionGroup
          title="등급 A · 응급"
          icon={<AlertTriangle className="text-destructive size-4" />}
          events={a}
        />
      )}
      {a.length > 0 && b.length > 0 && <Separator />}
      {b.length > 0 && (
        <SectionGroup
          title="등급 B · 비응급"
          icon={<AlertCircle className="size-4 text-amber-600" />}
          events={b}
        />
      )}
    </div>
  )
}

function SectionGroup({
  title,
  icon,
  events,
}: {
  title: string
  icon: React.ReactNode
  events: SafetyEvent[]
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {title}
        <Badge variant="outline" className="ml-1">
          {events.length}
        </Badge>
      </div>
      <ul className="grid gap-2">
        {events.map((e) => (
          <li
            key={e.safety_event_id}
            className="bg-card grid gap-1 rounded-md border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {SAFETY_EVENT_LABELS[e.event_type]}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatDateTimeKo(e.occurred_at)}
              </span>
            </div>
            <p className="text-muted-foreground text-sm">{e.context}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function gradeBadge(grade: SafetyGrade) {
  return grade === "A" ? "응급(A)" : "비응급(B)"
}
