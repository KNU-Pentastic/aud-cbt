"use client"

import { use } from "react"
import Link from "next/link"
import { Lock, RefreshCw, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckinsChart } from "@/components/checkins-chart"
import { SafetyEventList } from "@/components/safety-event-list"
import { useRegenerateCode, usePatient } from "@/lib/queries"
import {
  EMOTIONAL_TONE_LABELS,
  PROGRAM_STATUS_LABELS,
  SEVERITY_LABELS,
  SUICIDE_HISTORY_LABELS,
} from "@/lib/safety"
import { formatDateKo, formatDateTimeKo } from "@/lib/format"

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = use(params)
  const { data, isLoading, isError } = usePatient(patientId)
  const regenerate = useRegenerateCode(patientId)

  if (isError) {
    return (
      <div className="text-destructive">환자 정보를 불러오지 못했습니다.</div>
    )
  }
  if (isLoading || !data) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <header className="ring-glow relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-fuchsia-500/10 p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-2xl text-lg font-semibold">
                {data.name.slice(0, 1)}
              </div>
              <div>
                <h2 className="text-3xl font-bold tracking-tight">
                  {data.name}
                </h2>
                <p className="text-muted-foreground text-xs font-mono">
                  {data.patient_id}
                </p>
              </div>
              {data.llm_lock_status.locked && (
                <Badge
                  variant="destructive"
                  className="ml-2 gap-1 rounded-full"
                >
                  <Lock className="size-3" /> LLM 잠금
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={regenerate.isPending}
              onClick={async () => {
                try {
                  const r = await regenerate.mutateAsync()
                  toast.success(
                    `등록 코드 재발급: ${r.registration_code} (${formatDateKo(r.expires_at)}까지)`,
                  )
                } catch {
                  toast.error("재발급 실패")
                }
              }}
            >
              <RefreshCw className="size-4" />
              등록 코드 재발급
            </Button>
            <Link
              href={`/patients/${patientId}/reassess`}
              className={`${buttonVariants()} rounded-full`}
            >
              <Pencil className="size-4" />
              D4 재평가 입력
            </Link>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
          <KPI
            emoji="📅"
            label="현재 Week"
            value={`${data.progress.current_week} / 12`}
          />
          <KPI
            emoji="🌱"
            label="단주 일수"
            value={`${data.progress.sobriety_days}일`}
            highlight
          />
          <KPI
            emoji="💊"
            label="30일 복약 순응률"
            value={`${(data.progress.medication_adherence_rate_30d * 100).toFixed(0)}%`}
          />
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>최근 30일 추이</CardTitle>
            <CardDescription>
              기분·갈망 NRS와 수면 시간. 차트는 일일 체크인 데이터 기반.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CheckinsChart data={data.recent_checkins_30d} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>안전 이벤트</CardTitle>
            <CardDescription>
              v3.0은 별도 acknowledge 없이 통합 표시만.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SafetyEventList events={data.recent_safety_events} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>D0 퇴원 정보</CardTitle>
            <CardDescription>
              퇴원 시 입력된 임상 기본 정보.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Info
              label="진단"
              value={`${SEVERITY_LABELS[data.discharge_profile.diagnosis_severity]} · 입원 ${data.discharge_profile.admission_days}일`}
            />
            <Info
              label="퇴원일"
              value={formatDateKo(data.discharge_profile.discharge_date)}
            />
            <Info
              label="동반 정신질환"
              value={
                data.discharge_profile.comorbidities.join(", ") || "없음"
              }
            />
            <Info
              label="자살 사고 이력"
              value={
                SUICIDE_HISTORY_LABELS[
                  data.discharge_profile.suicide_ideation_history
                ]
              }
            />
            <Info
              label="다음 외래"
              value={formatDateKo(data.discharge_profile.next_outpatient_date)}
            />
            <Separator />
            <div className="grid gap-1">
              <p className="text-muted-foreground text-xs">처방 약물</p>
              {data.discharge_profile.medications.map((m, i) => (
                <p key={i}>
                  {m.name} · {m.dose} · {m.frequency}
                </p>
              ))}
            </div>
            <Separator />
            <div className="grid gap-1">
              <p className="text-muted-foreground text-xs">
                음주 트리거 (정규화)
              </p>
              <p className="text-xs italic">
                원문: {data.discharge_profile.primary_triggers_raw}
              </p>
              <div className="flex flex-wrap gap-1">
                {data.discharge_profile.normalized_triggers.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <Separator />
            <Info
              label="SSO"
              value={`${data.discharge_profile.sso.name} (${data.discharge_profile.sso.relation}) · ${data.discharge_profile.sso.phone}`}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>세션 이력</CardTitle>
            <CardDescription>
              최근 진행된 주간 CBT 세션 요약.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.recent_sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                기록된 세션이 없습니다.
              </p>
            ) : (
              data.recent_sessions.map((s) => (
                <div
                  key={s.session_id}
                  className="grid gap-1 rounded-md border p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Week {s.week_number}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTimeKo(s.completed_at)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    감정 톤: {EMOTIONAL_TONE_LABELS[s.emotional_tone]}
                  </p>
                  {s.completed_objectives.length > 0 && (
                    <p>
                      <span className="text-xs text-emerald-700">
                        달성:
                      </span>{" "}
                      {s.completed_objectives.join(", ")}
                    </p>
                  )}
                  {s.unaddressed_objectives.length > 0 && (
                    <p>
                      <span className="text-xs text-amber-700">미달성:</span>{" "}
                      {s.unaddressed_objectives.join(", ")}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>프로그램 상태</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-3">
            <Info
              label="상태"
              value={
                <Badge>
                  {PROGRAM_STATUS_LABELS[
                    data.recent_sessions.length > 0
                      ? "active"
                      : "active"
                  ]}
                </Badge>
              }
            />
            <Info
              label="LLM 잠금"
              value={
                data.llm_lock_status.locked
                  ? `잠금 (${formatDateTimeKo(data.llm_lock_status.since)}부터)`
                  : "해제됨"
              }
            />
            <Info
              label="진행 중 세션"
              value={
                data.active_session
                  ? `Week ${data.active_session.week_number}`
                  : "없음"
              }
            />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function Info({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="grid gap-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}

function KPI({
  emoji,
  label,
  value,
  highlight,
}: {
  emoji: string
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-card/70 rounded-2xl border p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-xl">{emoji}</span>
        <span
          className={`text-2xl font-bold tabular-nums ${highlight ? "text-gradient" : "text-foreground"}`}
        >
          {value}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs font-medium">{label}</p>
    </div>
  )
}
