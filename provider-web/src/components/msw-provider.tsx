"use client"

import { useEffect, useState } from "react"
import { ENABLE_MOCKS } from "@/lib/env"

export function MswProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!ENABLE_MOCKS)

  useEffect(() => {
    if (!ENABLE_MOCKS) return
    let cancelled = false
    void (async () => {
      const { worker } = await import("@/mocks/browser")
      await worker.start({
        onUnhandledRequest: "bypass",
        serviceWorker: { url: "/mockServiceWorker.js" },
      })
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return null
  return <>{children}</>
}
