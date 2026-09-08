"use client"

import { CheckCircle2, LoaderCircle, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { PermissionWorkflowStatus } from "@/features/workflow/types"

type ApprovalState = "idle" | "approving" | "approved" | "error"

export function WorkflowApprovalButton({
  requestId,
  status,
}: {
  requestId: string
  status: PermissionWorkflowStatus
}) {
  const router = useRouter()
  const [approvalState, setApprovalState] = useState<ApprovalState>("idle")
  const [progress, setProgress] = useState(status === "approved" ? 10 : 0)
  const [error, setError] = useState("")
  const approved = status === "approved" || approvalState === "approved"

  async function approve() {
    setApprovalState("approving")
    setError("")
    setProgress(3)
    const progressTimer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 1, 9))
    }, 140)

    try {
      const [response] = await Promise.all([
        fetch(`/api/permission-requests/${encodeURIComponent(requestId)}/accept`, { method: "POST" }),
        new Promise((resolve) => window.setTimeout(resolve, 900)),
      ])
      const payload = await response.json().catch(() => ({})) as {
        checksCompleted?: unknown
        error?: unknown
      }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to approve request")
      }
      setProgress(typeof payload.checksCompleted === "number" ? payload.checksCompleted : 10)
      setApprovalState("approved")
      router.refresh()
    } catch (approvalError) {
      setApprovalState("error")
      setError(approvalError instanceof Error ? approvalError.message : "Unable to approve request")
    } finally {
      window.clearInterval(progressTimer)
    }
  }

  if (approved) {
    return (
      <div className="workflow-approval-complete" role="status">
        <CheckCircle2 size={18} aria-hidden="true" />
        <div>
          <strong>Request approved</strong>
          <span>All requested Athenz changes were applied and verified.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="workflow-approval-action">
      <button
        className="button primary workflow-accept-button"
        disabled={approvalState === "approving"}
        type="button"
        onClick={approve}
      >
        {approvalState === "approving"
          ? <LoaderCircle className="spinning" size={15} aria-hidden="true" />
          : <Sparkles size={15} aria-hidden="true" />}
        {approvalState === "approving" ? `${progress} of 10 checks` : "Accept request"}
      </button>
      <p>Approval applies the requested memberships and policies with the Workflow Platform service identity.</p>
      {error ? <p className="workflow-approval-error" role="alert">{error}</p> : null}
    </div>
  )
}
