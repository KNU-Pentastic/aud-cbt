import { NextResponse } from "next/server"

// Fallback for when MSW service worker is not yet active (e.g., cold compile in dev).
// Returns JSON 503 so openapi-fetch gets parseable JSON and TanStack Query can retry.
const msw503 = () =>
  NextResponse.json(
    {
      error: {
        code: "MSW_NOT_READY",
        message: "Mock service worker not ready — retry in a moment",
      },
    },
    { status: 503 },
  )

export const GET = msw503
export const POST = msw503
export const PUT = msw503
export const PATCH = msw503
export const DELETE = msw503
