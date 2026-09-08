"use client"

import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

export function WorkflowRequestRefreshButton() {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()

  return (
    <button
      className="button workflow-request-refresh"
      disabled={isRefreshing}
      type="button"
      onClick={() => startRefresh(() => router.refresh())}
    >
      <RefreshCw className={isRefreshing ? "spinning" : undefined} size={14} aria-hidden="true" />
      {isRefreshing ? "Refreshing..." : "Refresh"}
    </button>
  )
}
