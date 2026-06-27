import { NextResponse, type NextRequest } from "next/server"
import { getSession, SESSION_COOKIE_NAME } from "@/lib/session"

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000/v1"

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "host",
  // fetch()(undici)가 업스트림 응답을 자동으로 압축 해제하므로, 업스트림이 보낸
  // content-encoding/content-length 를 그대로 브라우저로 넘기면 안 된다. 넘기면
  // 브라우저가 (이미 평문인) 본문을 gzip/br 로 디코딩하려다 ERR_CONTENT_DECODING_FAILED
  // 로 깨진다. Railway 처럼 응답을 압축하는 업스트림 뒤에서만 재현된다(로컬 uvicorn 은 무압축).
  "content-length",
  "content-encoding",
])

async function forward(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "세션이 만료되었습니다.",
          details: [],
          request_id: crypto.randomUUID(),
        },
      },
      { status: 401 },
    )
  }

  const target = `${BACKEND_URL}/${path.join("/")}${req.nextUrl.search}`

  const headers = new Headers()
  for (const [k, v] of req.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== "cookie") {
      headers.set(k, v)
    }
  }
  headers.set("Authorization", `Bearer ${session.access_token}`)

  const hasBody = !["GET", "HEAD"].includes(req.method)
  const init: RequestInit = {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  }

  const upstream = await fetch(target, init)

  const respHeaders = new Headers()
  for (const [k, v] of upstream.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== "set-cookie") {
      respHeaders.set(k, v)
    }
  }

  // 세션 쿠키(JWT)는 유효하지만 그 안의 백엔드 토큰이 만료/무효라 백엔드가 401을
  // 주는 "좀비 세션" 상태. 쿠키를 만료시켜 미들웨어가 다음 요청에서 /login 으로 보내도록 한다.
  if (upstream.status === 401) {
    respHeaders.append(
      "set-cookie",
      `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    )
  }

  return new NextResponse(
    upstream.status === 204 || upstream.status === 304 ? null : upstream.body,
    { status: upstream.status, headers: respHeaders },
  )
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
export const HEAD = forward
export const OPTIONS = forward

export const dynamic = "force-dynamic"
