import "server-only"
import { cookies } from "next/headers"
import { jwtVerify, SignJWT } from "jose"

const SESSION_COOKIE = "provider_session"
const SESSION_TTL_SECONDS = 8 * 60 * 60

export type ProviderSession = {
  provider_id: string
  email: string
  access_token: string
  expires_at: number
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured")
  }
  return new TextEncoder().encode(secret)
}

export async function encryptSession(payload: ProviderSession): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(payload.expires_at)
    .sign(getSecret())
}

export async function decryptSession(
  token: string | undefined,
): Promise<ProviderSession | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    })
    return payload as unknown as ProviderSession
  } catch {
    return null
  }
}

export async function createSession(payload: Omit<ProviderSession, "expires_at">) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const session = await encryptSession({ ...payload, expires_at: expiresAt })
  const store = await cookies()
  store.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function getSession(): Promise<ProviderSession | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return decryptSession(token)
}

export async function deleteSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
