import { NextResponse, type NextRequest } from "next/server"
import { getSession } from "@/lib/session"

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
  "content-length",
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
