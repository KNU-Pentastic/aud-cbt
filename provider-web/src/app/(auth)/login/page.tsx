import { Sparkles } from "lucide-react"
import { LoginForm } from "./login-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <section className="hidden lg:block">
          <Badge
            variant="secondary"
            className="mb-5 rounded-full px-3 py-1 text-xs"
          >
            <Sparkles className="size-3" /> AUD CBT v3.0
          </Badge>
          <h1 className="text-5xl leading-tight font-bold tracking-tight">
            <span className="text-gradient">퇴원 후 3개월</span>,
            <br /> 환자 곁에 LLM 코치.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-md text-base leading-relaxed">
            매일 체크인부터 주 1회 CBT 세션, 안전 분류기까지 — 의료진은 외래
            진료에서 환자 상태를 5분 안에 파악할 수 있습니다.
          </p>
          <ul className="mt-7 grid gap-3 text-sm">
            <Feat>📊 30일 추이와 안전 이벤트를 한 화면에</Feat>
            <Feat>⚡ D0 등록 → 8자리 코드 즉시 발급</Feat>
            <Feat>🔒 TOTP 2단계 인증으로 안전하게</Feat>
          </ul>
        </section>
        <Card className="ring-glow rounded-3xl border-0">
          <CardHeader>
            <CardTitle className="text-2xl">의료진 로그인</CardTitle>
            <CardDescription>
              이메일·비밀번호·TOTP 3단계 인증이 필요합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function Feat({ children }: { children: React.ReactNode }) {
  return (
    <li className="bg-card/60 rounded-2xl border px-4 py-3 backdrop-blur-sm">
      {children}
    </li>
  )
}
