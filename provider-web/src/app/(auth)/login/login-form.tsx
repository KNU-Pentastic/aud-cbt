"use client"

import { useActionState } from "react"
import { loginAction, type LoginState } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  const [state, action, pending] = useActionState<
    LoginState | undefined,
    FormData
  >(loginAction, undefined)

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="provider@example.com"
          autoComplete="email"
          required
        />
        {state?.errors?.email && (
          <p className="text-destructive text-sm">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
        />
        {state?.errors?.password && (
          <p className="text-destructive text-sm">{state.errors.password[0]}</p>
        )}
      </div>

      {state?.errors?.form && (
        <p className="text-destructive text-sm" role="alert">
          {state.errors.form[0]}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "로그인 중..." : "로그인"}
      </Button>

      <p className="text-muted-foreground text-xs">
        데모 자격: demo.doctor@example.com / DemoPassword!2026
      </p>
    </form>
  )
}
