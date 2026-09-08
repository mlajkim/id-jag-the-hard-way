"use client"

import { CheckCircle2, Clock3, LoaderCircle, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export type ToolPermissionRequestStatus =
  | "missing"
  | "not-required"
  | "ready"
  | "unavailable"
  | "unconfigured"

type RequestState = "idle" | "requesting" | "submitted" | "approved" | "error"

export function ToolPermissionAccessButton({
  mcpKeyName,
  project,
  status,
  toolName,
  workflowRequestId,
}: {
  mcpKeyName: string
  project: string
  status: ToolPermissionRequestStatus
  toolName: string
  workflowRequestId?: string
}) {
  const router = useRouter()
  const [requestState, setRequestState] = useState<RequestState>("idle")
  const [progress, setProgress] = useState(0)
  const [requestError, setRequestError] = useState("")
  const approved = status === "ready" || requestState === "approved"
  const pending = Boolean(workflowRequestId) || requestState === "submitted"
  const requesting = requestState === "requesting"
  const disabled = status !== "missing" || requesting || pending || approved

  async function requestPermission() {
    setRequestState("requesting")
    setRequestError("")
    setProgress(3)
    const progressTimer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 1, 9))
    }, 140)

    try {
      const [response] = await Promise.all([
        fetch(
          `/api/mcp-servers/${encodeURIComponent(mcpKeyName)}/permission-requests?project=${encodeURIComponent(project)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ toolName }),
          },
        ),
        new Promise((resolve) => window.setTimeout(resolve, 900)),
      ])
      const payload = await response.json().catch(() => ({})) as {
        approved?: unknown
        checksCompleted?: unknown
        error?: unknown
        request?: { id?: unknown; status?: unknown }
      }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to request permission")
      }

      setProgress(typeof payload.checksCompleted === "number" ? payload.checksCompleted : 10)
      setRequestState(payload.request?.status === "pending" ? "submitted" : "approved")
      router.refresh()
    } catch (error) {
      setRequestState("error")
      setRequestError(error instanceof Error ? error.message : "Unable to request permission")
    } finally {
      window.clearInterval(progressTimer)
    }
  }

  const label = requesting
    ? `${progress} of 10`
    : approved
      ? "Permission granted"
      : pending
        ? "Request pending"
      : status === "not-required"
        ? "No request needed"
        : status === "unconfigured"
          ? "Configure first"
          : status === "unavailable"
            ? "Request unavailable"
            : "Request permission"

  return (
    <div className="tool-permission-request-control">
      <button
        aria-label={`${label} for ${toolName}`}
        className="button tool-permission-request-button"
        data-state={approved ? "approved" : pending ? "pending" : requestState}
        disabled={disabled}
        title={requestError || undefined}
        type="button"
        onClick={requestPermission}
      >
        {requesting
          ? <LoaderCircle className="spinning" size={13} aria-hidden="true" />
          : approved
            ? <CheckCircle2 size={13} aria-hidden="true" />
            : pending
              ? <Clock3 size={13} aria-hidden="true" />
              : <Sparkles size={13} aria-hidden="true" />}
        {label}
      </button>
      {requestError ? <span className="tool-permission-request-error" role="alert">{requestError}</span> : null}
    </div>
  )
}
