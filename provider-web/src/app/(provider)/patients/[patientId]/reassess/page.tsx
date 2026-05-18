"use client"

import { use, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  usePatient,
  useUpdateMedications,
  useUpdateOutpatientDate,
  useUpdateProgramStatus,
} from "@/lib/queries"
import { formatDateKo } from "@/lib/format"

const MedsSchema = z.object({
  medications: z
    .array(
      z.object({
        name: z.string().min(1, "약물명"),
        dose: z.string().min(1, "용량"),
        frequency: z.string().min(1, "복용 빈도"),
      }),
    )
    .min(0),
  change_note: z.string().optional(),
})

const DateSchema = z
  .object({
    next_outpatient_date: z.string().min(1, "다음 외래 일정"),
    change_note: z.string().optional(),
  })
  .refine((v) => new Date(v.next_outpatient_date) >= startOfToday(), {
    message: "과거 날짜는 입력할 수 없습니다.",
    path: ["next_outpatient_date"],
  })

const StatusSchema = z.object({
  new_status: z.enum(["completed", "withdrawn"], {
    error: "변경할 상태 선택",
  }),
  reason: z.string().min(2, "사유를 입력하세요."),
})

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default function ReassessPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = use(params)
  const router = useRouter()
  const { data, isLoading, isError } = usePatient(patientId)

  if (isError)
    return <p className="text-destructive">환자 정보를 불러올 수 없습니다.</p>
  if (isLoading || !data)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )

  return (
    <div className="grid gap-6">
      <header className="ring-glow relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-fuchsia-500/10 p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
              D4 · 재평가 입력
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight">
              {data.name} <span className="text-gradient">재평가</span> 📝
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              외래 진료 후 변경된 정보(약물·외래 일정·프로그램 상태)를
              반영합니다.
            </p>
          </div>
          <Link
            href={`/patients/${patientId}`}
            className={`${buttonVariants({ variant: "outline" })} rounded-full`}
          >
            <ArrowLeft className="size-4" /> 상세로 돌아가기
          </Link>
        </div>
      </header>

      <MedicationsCard patientId={patientId} initial={data.discharge_profile.medications} />
      <OutpatientDateCard
        patientId={patientId}
        initial={data.discharge_profile.next_outpatient_date}
      />
      <ProgramStatusCard
        patientId={patientId}
        onChanged={() => router.push("/patients")}
      />
    </div>
  )
}

function MedicationsCard({
  patientId,
  initial,
}: {
  patientId: string
  initial: { name: string; dose: string; frequency: string }[]
}) {
  const mutation = useUpdateMedications(patientId)
  const form = useForm<z.infer<typeof MedsSchema>>({
    resolver: zodResolver(MedsSchema),
    defaultValues: { medications: initial, change_note: "" },
  })
  const meds = useFieldArray({ control: form.control, name: "medications" })

  useEffect(() => {
    form.reset({ medications: initial, change_note: "" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.length])

  async function onSubmit(values: z.infer<typeof MedsSchema>) {
    try {
      await mutation.mutateAsync(values)
      toast.success("약물 정보가 갱신되었습니다. LLM 컨텍스트에 즉시 반영됨.")
    } catch {
      toast.error("약물 갱신 실패")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>처방 약물 갱신</CardTitle>
        <CardDescription>
          전체 교체 방식 (PUT). 추가·중단·용량 변경 후 저장하면 즉시 LLM
          컨텍스트에 반영됩니다.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="grid gap-3">
            {meds.fields.map((f, i) => (
              <div
                key={f.id}
                className="grid grid-cols-[1fr_120px_140px_auto] items-start gap-2"
              >
                <Input
                  placeholder="약물명"
                  {...form.register(`medications.${i}.name`)}
                />
                <Input
                  placeholder="용량"
                  {...form.register(`medications.${i}.dose`)}
                />
                <Input
                  placeholder="빈도"
                  {...form.register(`medications.${i}.frequency`)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => meds.remove(i)}
                  aria-label="제거"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  meds.append({ name: "", dose: "", frequency: "" })
                }
              >
                <Plus className="size-3" /> 약물 추가
              </Button>
            </div>
            <FormField
              control={form.control}
              name="change_note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>변경 사유 (선택)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="예: 부작용으로 디설피람 → 아캄프로세이트 교체"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "저장 중..." : "약물 정보 저장"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

function OutpatientDateCard({
  patientId,
  initial,
}: {
  patientId: string
  initial: string
}) {
  const mutation = useUpdateOutpatientDate(patientId)
  const form = useForm<z.infer<typeof DateSchema>>({
    resolver: zodResolver(DateSchema),
    defaultValues: { next_outpatient_date: initial, change_note: "" },
  })

  async function onSubmit(values: z.infer<typeof DateSchema>) {
    try {
      await mutation.mutateAsync(values)
      toast.success(
        `다음 외래 일정이 ${formatDateKo(values.next_outpatient_date)}로 갱신되었습니다.`,
      )
    } catch {
      toast.error("외래 일정 갱신 실패")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>다음 외래 일정 갱신</CardTitle>
        <CardDescription>
          변경 즉시 환자 P1 홈에 반영됩니다. 의료진→환자 메시지는 v3.0에서
          Post-MVP이므로 별도 안내는 SMS·전화로 보완하세요.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="next_outpatient_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>다음 외래 예약일</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="change_note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>변경 메모 (선택)</FormLabel>
                  <FormControl>
                    <Input placeholder="예: 환자 요청으로 한 주 미룸" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "저장 중..." : "외래 일정 저장"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

function ProgramStatusCard({
  patientId,
  onChanged,
}: {
  patientId: string
  onChanged: () => void
}) {
  const mutation = useUpdateProgramStatus(patientId)
  const form = useForm<z.infer<typeof StatusSchema>>({
    resolver: zodResolver(StatusSchema),
    defaultValues: { new_status: "completed", reason: "" },
  })

  async function submit(values: z.infer<typeof StatusSchema>) {
    try {
      await mutation.mutateAsync(values)
      toast.success(
        values.new_status === "completed"
          ? "프로그램이 종결 처리되었습니다."
          : "프로그램이 중단 처리되었습니다.",
      )
      onChanged()
    } catch {
      toast.error("상태 변경 실패")
    }
  }

  const newStatus = form.watch("new_status")

  return (
    <Card>
      <CardHeader>
        <CardTitle>프로그램 상태 변경</CardTitle>
        <CardDescription>
          12주 완료 → <Badge variant="secondary">종결</Badge>, 환자 사용
          중단 → <Badge variant="outline">중단</Badge>. 한 번 변경하면 환자
          앱 접근에 영향이 갑니다.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)}>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="new_status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>새 상태</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="completed">종결 (12주 완료)</SelectItem>
                      <SelectItem value="withdrawn">중단 (중도 중단)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>사유</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        newStatus === "completed"
                          ? "예: Week 12 종결 세션 완료"
                          : "예: 환자가 외래 진료에서 사용 중단 요청"
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant={
                      newStatus === "withdrawn" ? "destructive" : "default"
                    }
                    disabled={!form.formState.isValid || mutation.isPending}
                  >
                    {newStatus === "completed" ? "종결 처리" : "중단 처리"}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    프로그램을{" "}
                    {newStatus === "completed" ? "종결" : "중단"} 처리하시겠어요?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    이 작업은 즉시 반영되며 환자 앱의 접근이 제한됩니다.
                    데이터는 보존됩니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={form.handleSubmit(submit)}
                  >
                    확인하고 처리
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
