import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session"

const PUBLIC_PATHS = ["/login"]

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  )

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = await decryptSession(cookie)

  if (!isPublic && !session) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }
  if (isPublic && session) {
    const url = req.nextUrl.clone()
    url.pathname = "/patients"
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mockServiceWorker.js).*)"],
}
