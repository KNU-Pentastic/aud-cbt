"use client"

import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
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
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { COMORBIDITY_OPTIONS, MEDICATION_PRESETS } from "@/lib/safety"
import { useCreatePatient } from "@/lib/queries"
import { formatDateKo } from "@/lib/format"

const Schema = z.object({
  name: z.string().min(1, "이름을 입력하세요."),
  phone: z
    .string()
    .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, "휴대전화 형식을 확인하세요."),
  date_of_birth: z.string().min(1, "생년월일을 입력하세요."),
  sex: z.enum(["male", "female"], { error: "성별을 선택하세요." }),
  discharge_date: z.string().min(1, "퇴원일을 입력하세요."),
  diagnosis_severity: z.enum(["moderate", "severe"], {
    error: "진단 중등도를 선택하세요.",
  }),
  admission_days: z
    .number({ error: "입원 일수를 입력하세요." })
    .int()
    .min(1, "1일 이상")
    .max(180, "180일 이하"),
  medications: z
    .array(
      z.object({
        name: z.string().min(1, "약물명"),
        dose: z.string().min(1, "용량"),
        frequency: z.string().min(1, "복용 빈도"),
      }),
    )
    .min(0),
  comorbidities: z.array(z.string()),
  suicide_ideation_history: z.enum(
    ["none", "past", "during_admission", "current"],
    { error: "자살 사고 이력을 선택하세요." },
  ),
  primary_triggers_raw: z
    .string()
    .min(2, "주된 음주 트리거를 1~2줄 적어주세요.")
    .max(500, "500자 이내"),
  sso_name: z.string().min(1, "SSO 이름"),
  sso_relation: z.string().min(1, "관계"),
  sso_phone: z
    .string()
    .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, "SSO 휴대전화 형식 확인"),
  next_outpatient_date: z.string().min(1, "다음 외래 예약일을 입력하세요."),
})

type FormValues = z.infer<typeof Schema>

const DEFAULTS: FormValues = {
  name: "",
  phone: "",
  date_of_birth: "",
  sex: "male",
  discharge_date: "",
  diagnosis_severity: "moderate",
  admission_days: 14,
  medications: [{ name: "날트렉손", dose: "50mg", frequency: "1x daily" }],
  comorbidities: [],
  suicide_ideation_history: "none",
  primary_triggers_raw: "",
  sso_name: "",
  sso_relation: "",
  sso_phone: "",
  next_outpatient_date: "",
}

export default function NewPatientPage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: DEFAULTS,
    mode: "onBlur",
  })
  const meds = useFieldArray({ control: form.control, name: "medications" })

  const createPatient = useCreatePatient()
  const [issued, setIssued] = useState<{
    name: string
    code: string
    expiresAt: string
    triggers: string[]
  } | null>(null)

  async function onSubmit(values: FormValues) {
    try {
      const result = await createPatient.mutateAsync({
        name: values.name,
        phone: values.phone,
        date_of_birth: values.date_of_birth,
        sex: values.sex,
        discharge_date: values.discharge_date,
        diagnosis_severity: values.diagnosis_severity,
        admission_days: values.admission_days,
        medications: values.medications,
        comorbidities: values.comorbidities,
        suicide_ideation_history: values.suicide_ideation_history,
        primary_triggers: { raw_text: values.primary_triggers_raw },
        sso: {
          name: values.sso_name,
          relation: values.sso_relation,
          phone: values.sso_phone,
        },
        next_outpatient_date: values.next_outpatient_date,
      })
      setIssued({
        name: values.name,
        code: result.registration_code,
        expiresAt: result.expires_at,
        triggers: result.normalized_triggers,
      })
      form.reset(DEFAULTS)
      toast.success("환자 등록이 완료되었습니다.")
    } catch (e) {
      toast.error("환자 등록 중 오류가 발생했습니다.")
      console.error(e)
    }
  }

  const selectedComorbidities = form.watch("comorbidities")

  return (
    <div className="grid gap-6">
      <header className="ring-glow relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-fuchsia-500/10 p-7">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
          D0 · 퇴원 정보 입력
        </p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight">
          <span className="text-gradient">신규 환자</span> 등록 🆕
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          8개 필드를 입력하면 8자리 등록 코드가 즉시 발급됩니다. 환자에게
          전달하면 앱에서 본인 인증을 거쳐 활성화됩니다. 트리거 자유 텍스트는
          백엔드 LLM이 정규화 태그로 변환합니다.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>환자 기본 정보</CardTitle>
              <CardDescription>이름·연락처·생년월일·성별</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>이름</FormLabel>
                    <FormControl>
                      <Input placeholder="홍길동" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>휴대전화</FormLabel>
                    <FormControl>
                      <Input placeholder="010-1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>생년월일</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>성별</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">남</SelectItem>
                        <SelectItem value="female">여</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>임상 정보 (필드 1~5)</CardTitle>
              <CardDescription>
                진단 중등도, 입원 기간, 처방 약물, 동반 정신질환, 자살 사고
                이력
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="diagnosis_severity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>① 진단 중등도</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="moderate">DSM-5 중등도</SelectItem>
                          <SelectItem value="severe">DSM-5 중증</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="admission_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>② 입원 기간 (일)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={180}
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="discharge_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>퇴원일</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-2">
                <Label>③ 처방 약물</Label>
                <p className="text-muted-foreground text-xs">
                  날트렉손·아캄프로세이트·디설피람 등. 입력 즉시 LLM
                  컨텍스트에 반영됩니다.
                </p>
                <div className="grid gap-2">
                  {meds.fields.map((f, i) => (
                    <div
                      key={f.id}
                      className="grid grid-cols-[1fr_120px_140px_auto] gap-2"
                    >
                      <Input
                        placeholder="약물명"
                        {...form.register(`medications.${i}.name`)}
                      />
                      <Input
                        placeholder="용량 (예: 50mg)"
                        {...form.register(`medications.${i}.dose`)}
                      />
                      <Input
                        placeholder="빈도 (예: 1x daily)"
                        {...form.register(`medications.${i}.frequency`)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => meds.remove(i)}
                        aria-label="약물 제거"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
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
                    {MEDICATION_PRESETS.map((p) => (
                      <Button
                        key={p.name}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => meds.append({ ...p })}
                      >
                        + {p.name} 추가
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>④ 동반 정신질환 (다중 선택)</Label>
                <div className="flex flex-wrap gap-2">
                  {COMORBIDITY_OPTIONS.map((c) => {
                    const selected = selectedComorbidities.includes(c)
                    return (
                      <Button
                        key={c}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const next = selected
                            ? selectedComorbidities.filter((x) => x !== c)
                            : [...selectedComorbidities, c]
                          form.setValue("comorbidities", next, {
                            shouldDirty: true,
                          })
                        }}
                      >
                        {c}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <FormField
                control={form.control}
                name="suicide_ideation_history"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>⑤ 자살 사고 이력</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">없음</SelectItem>
                        <SelectItem value="past">과거에 있었음</SelectItem>
                        <SelectItem value="during_admission">
                          입원 중 있었음
                        </SelectItem>
                        <SelectItem value="current">현재 있음</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>트리거·SSO·외래 (필드 6~8)</CardTitle>
              <CardDescription>
                주된 음주 트리거(자유 텍스트, LLM 정규화), 주된 지지자, 다음
                외래 예약일
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField
                control={form.control}
                name="primary_triggers_raw"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>⑥ 주된 음주 트리거 (자유 텍스트 1~2줄)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="예: 퇴근 후 회식 자리, 부부 다툼 직후"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      백엔드 LLM이 work_stress, social_pressure 등 정규화
                      태그로 변환합니다.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="sso_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>⑦ SSO 이름</FormLabel>
                      <FormControl>
                        <Input placeholder="홍길자" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sso_relation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>관계</FormLabel>
                      <FormControl>
                        <Input placeholder="배우자" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sso_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SSO 연락처</FormLabel>
                      <FormControl>
                        <Input placeholder="010-1234-5678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="next_outpatient_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>⑧ 다음 외래 예약일</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link
              href="/patients"
              className={buttonVariants({ variant: "outline" })}
            >
              취소
            </Link>
            <Button
              type="submit"
              disabled={createPatient.isPending}
            >
              {createPatient.isPending
                ? "등록 중..."
                : "환자 등록 및 코드 발급"}
            </Button>
          </div>
        </form>
      </Form>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>환자 등록 완료</DialogTitle>
            <DialogDescription>
              아래 8자리 등록 코드를 환자에게 SMS·종이 등으로 전달하세요.
              <strong>1회용</strong>이며 7일 후 만료됩니다.
            </DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="grid gap-3">
              <div>
                <p className="text-muted-foreground text-xs">환자명</p>
                <p className="text-base font-medium">{issued.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">등록 코드</p>
                <p className="font-mono text-3xl tracking-widest">
                  {issued.code}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">유효 기간</p>
                <p className="text-sm">
                  {formatDateKo(issued.expiresAt)}까지
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  정규화된 트리거 태그
                </p>
                <div className="flex flex-wrap gap-1">
                  {issued.triggers.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Link href="/patients" className={buttonVariants()}>
              환자 목록으로
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
