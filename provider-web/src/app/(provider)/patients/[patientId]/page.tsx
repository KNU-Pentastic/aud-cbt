"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Lock,
  LockOpen,
  RefreshCw,
  Pencil,
  Trash2,
  KeyRound,
  ShieldAlert,
} from "lucide-react"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { CheckinsChart } from "@/components/checkins-chart"
import { SafetyEventList } from "@/components/safety-event-list"
import {
  useRegenerateCode,
  useRegistrationCode,
  useDeletePatient,
  usePatient,
  useUnlockLlm,
} from "@/lib/queries"
import {
  EMOTIONAL_TONE_LABELS,
  PROGRAM_STATUS_LABELS,
  SAFETY_EVENT_LABELS,
  SEVERITY_LABELS,
  SUICIDE_HISTORY_LABELS,
  type SafetyEventType,
} from "@/lib/safety"
import { formatDateKo, formatDateTimeKo } from "@/lib/format"

function lockReasonLabel(reason: string | null): string {
  if (!reason) return "안전 이벤트"
  if (reason in SAFETY_EVENT_LABELS)
    return SAFETY_EVENT_LABELS[reason as SafetyEventType]
  return "안전 이벤트"
}

const REG_CODE_STATUS_LABEL: Record<string, string> = {
  active: "유효",
  consumed: "사용됨",
  expired: "만료",
  none: "없음",
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = use(params)
  const router = useRouter()
  const { data, isLoading, isError } = usePatient(patientId)
  const regCode = useRegistrationCode(patientId)
  const regenerate = useRegenerateCode(patientId)
  const deletePatient = useDeletePatient()
  const unlockLlm = useUnlockLlm(patientId)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [confirmUnlock, setConfirmUnlock] = useState(false)
  const [unlockNote, setUnlockNote] = useState("")

  const runUnlock = async () => {
    try {
      const r = await unlockLlm.mutateAsync({
        note: unlockNote.trim() || undefined,
      })
      toast.success(
        r.acknowledged_safety_events > 0
          ? `LLM 잠금을 해제했습니다. 안전 이벤트 ${r.acknowledged_safety_events}건 확인 처리됨.`
          : "LLM 잠금을 해제했습니다.",
      )
      setConfirmUnlock(false)
      setUnlockNote("")
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "잠금 해제 실패"
      toast.error(msg)
    }
  }

  const runRegenerate = async () => {
    try {
      const r = await regenerate.mutateAsync()
      toast.success(
        `등록 코드 재발급: ${r.registration_code} (${formatDateKo(r.expires_at)}까지)`,
      )
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "재발급 실패"
      toast.error(msg)
    } finally {
      setConfirmRegen(false)
    }
  }

  const onRegenerateClick = () => {
    // 이미 가입한 환자는 재발급 시 기존 PIN/가입이 초기화되므로 먼저 확인한다.
    if (regCode.data?.is_registered) {
      setConfirmRegen(true)
    } else {
      void runRegenerate()
    }
  }

  const runDelete = async () => {
    try {
      await deletePatient.mutateAsync(patientId)
      toast.success("환자를 삭제했습니다.")
      router.replace("/patients")
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "삭제 실패"
      toast.error(msg)
    }
  }

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

      {/* LLM 안전 잠금 — 자살 위험·급성 중독 감지 시 잠금, 의료진이 해제 */}
      <Card
        className={
          data.llm_lock_status.locked ? "border-destructive/50" : undefined
        }
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data.llm_lock_status.locked ? (
              <ShieldAlert className="text-destructive size-4" />
            ) : (
              <LockOpen className="size-4 text-emerald-600" />
            )}
            LLM 안전 잠금
          </CardTitle>
          <CardDescription>
            등급 A(자살 위험·급성 중독) 감지 시 환자 앱의 LLM 대화가 자동
            잠깁니다. 환자는 스스로 해제할 수 없으며, 위험도 평가 후 담당
            의료진이 해제합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          {data.llm_lock_status.locked ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info
                  label="상태"
                  value={
                    <Badge variant="destructive" className="gap-1 rounded-full">
                      <Lock className="size-3" /> 잠금
                    </Badge>
                  }
                />
                <Info
                  label="사유"
                  value={lockReasonLabel(data.llm_lock_status.reason)}
                />
                <Info
                  label="잠금 시각"
                  value={
                    data.llm_lock_status.since
                      ? formatDateTimeKo(data.llm_lock_status.since)
                      : "—"
                  }
                />
              </div>
              <Button
                disabled={unlockLlm.isPending}
                onClick={() => {
                  setUnlockNote("")
                  setConfirmUnlock(true)
                }}
              >
                <LockOpen className="size-4" />
                잠금 해제
              </Button>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Info
                label="상태"
                value={
                  <Badge variant="secondary" className="gap-1 rounded-full">
                    <LockOpen className="size-3" /> 정상
                  </Badge>
                }
              />
              {data.llm_lock_status.unlocked_at && (
                <Info
                  label="최근 해제"
                  value={`${formatDateTimeKo(data.llm_lock_status.unlocked_at)}${
                    data.llm_lock_status.unlocked_by
                      ? ` · ${data.llm_lock_status.unlocked_by}`
                      : ""
                  }`}
                />
              )}
              {data.llm_lock_status.unlock_note && (
                <Info
                  label="해제 메모"
                  value={data.llm_lock_status.unlock_note}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 등록 정보 — 현재 등록 코드 확인 + 재발급 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> 등록 정보
          </CardTitle>
          <CardDescription>
            환자 앱 등록에 사용하는 코드입니다. 분실 시 재발급할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Info
              label="가입 상태"
              value={
                <Badge variant={regCode.data?.is_registered ? "secondary" : "outline"}>
                  {regCode.data?.is_registered ? "가입 완료" : "미가입"}
                </Badge>
              }
            />
            <Info
              label="현재 등록 코드"
              value={
                <span className="font-mono text-base font-semibold tracking-wider">
                  {regCode.data?.registration_code ?? "—"}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {REG_CODE_STATUS_LABEL[regCode.data?.status ?? "none"]}
                  </span>
                </span>
              }
            />
            <Info
              label="만료일"
              value={
                regCode.data?.expires_at
                  ? formatDateKo(regCode.data.expires_at)
                  : "—"
              }
            />
          </div>
          <Button
            variant="outline"
            disabled={regenerate.isPending}
            onClick={onRegenerateClick}
          >
            <RefreshCw className="size-4" />
            등록 코드 재발급
          </Button>
        </CardContent>
      </Card>

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

      {/* 위험 구역 — 환자 영구 삭제 */}
      <section>
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="size-4" /> 위험 구역
            </CardTitle>
            <CardDescription>
              환자와 모든 관련 데이터(대화·체크인·안전 이벤트·등록 코드 등)를 영구
              삭제합니다. 되돌릴 수 없습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteConfirmText("")
                setConfirmDelete(true)
              }}
            >
              <Trash2 className="size-4" />
              환자 삭제
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* LLM 잠금 해제 확인 */}
      <AlertDialog open={confirmUnlock} onOpenChange={setConfirmUnlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>LLM 잠금을 해제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              해제하면 환자가 다시 LLM 대화를 사용할 수 있습니다. 환자의 위험도를
              충분히 평가한 뒤 진행하세요. 해제 사실은 담당자·시각과 함께
              기록됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <label className="text-muted-foreground text-xs" htmlFor="unlock-note">
              해제 사유 (선택)
            </label>
            <Textarea
              id="unlock-note"
              value={unlockNote}
              onChange={(e) => setUnlockNote(e.target.value)}
              maxLength={500}
              placeholder="예: 외래에서 위험 평가 완료, 보호자 동석 확인"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction disabled={unlockLlm.isPending} onClick={runUnlock}>
              잠금 해제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 재발급 확인 (가입 완료 환자) */}
      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>등록 코드를 재발급할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이미 가입을 완료한 환자입니다. 재발급하면 기존 PIN과 가입이 초기화되어,
              환자는 새 코드로 다시 등록해야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction disabled={regenerate.isPending} onClick={runRegenerate}>
              재발급
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 (환자명 입력) */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>환자를 영구 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 확인을 위해 환자명{" "}
              <span className="text-foreground font-semibold">{data.name}</span> 을(를)
              입력하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={data.name}
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePatient.isPending || deleteConfirmText !== data.name}
              onClick={runDelete}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
