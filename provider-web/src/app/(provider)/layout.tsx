import Link from "next/link"
import { redirect } from "next/navigation"
import { Users, UserPlus, LogOut, Sparkles } from "lucide-react"
import { getSession, deleteSession } from "@/lib/session"
import { Button } from "@/components/ui/button"

async function logoutAction() {
  "use server"
  await deleteSession()
  redirect("/login")
}

export default async function ProviderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  return (
    <div className="grid min-h-svh grid-cols-[260px_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground flex flex-col gap-6 p-5">
        <Link
          href="/patients"
          className="flex items-center gap-2 px-2 pt-2"
        >
          <span className="bg-sidebar-primary text-sidebar-primary-foreground inline-flex size-9 items-center justify-center rounded-2xl">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-base font-semibold">AUD CBT</p>
            <p className="text-sidebar-foreground/60 text-xs">
              의료진 포털 · v3.0
            </p>
          </div>
        </Link>

        <nav className="grid gap-1">
          <NavLink href="/patients" icon={<Users className="size-4" />}>
            환자 목록
          </NavLink>
          <NavLink
            href="/patients/new"
            icon={<UserPlus className="size-4" />}
          >
            D0 신규 환자 등록
          </NavLink>
        </nav>

        <div className="bg-sidebar-accent/40 mt-auto grid gap-3 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-9 items-center justify-center rounded-full text-sm font-medium">
              {session.email.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">로그인 됨</p>
              <p className="text-sidebar-foreground/60 truncate text-xs">
                {session.email}
              </p>
            </div>
          </div>
          <form action={logoutAction}>
            <Button
              variant="outline"
              size="sm"
              className="border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent w-full"
            >
              <LogOut className="size-3.5" /> 로그아웃
            </Button>
          </form>
        </div>
      </aside>
      <main className="overflow-auto p-8 lg:p-10">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  )
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="hover:bg-sidebar-accent inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
    >
      <span className="text-sidebar-foreground/70">{icon}</span>
      {children}
    </Link>
  )
}
