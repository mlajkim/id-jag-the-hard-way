"use client"

import { CheckCircle2, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { WorkflowApplicationStatus } from "@/features/workflow/types"

type ApprovalState = "idle" | "approving" | "approved" | "error"

export function WorkflowApprovalButton({
  requestId,
  status,
}: {
  requestId: string
  status: WorkflowApplicationStatus
}) {
  const router = useRouter()
  const [approvalState, setApprovalState] = useState<ApprovalState>("idle")
  const [error, setError] = useState("")
  const approved = status === "approved" || approvalState === "approved"

  async function approve() {
    setApprovalState("approving")
    setError("")

    try {
      const response = await fetch(`/api/permission-requests/${encodeURIComponent(requestId)}/accept`, { method: "POST" })
      const payload = await response.json().catch(() => ({})) as { error?: unknown }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to approve request")
      }
      setApprovalState("approved")
      router.refresh()
    } catch (approvalError) {
      setApprovalState("error")
      setError(approvalError instanceof Error ? approvalError.message : "Unable to approve request")
    }
  }

  if (approved) {
    return (
      <div className="workflow-approval-complete" role="status">
        <CheckCircle2 size={18} aria-hidden="true" />
        <div>
          <strong>Request approved</strong>
          <span>The approval decision was recorded. No infrastructure changes were applied.</span>
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
          : <CheckCircle2 size={15} aria-hidden="true" />}
        {approvalState === "approving" ? "Approving..." : "Approve request"}
      </button>
      <p>Approval records the workflow decision only. Operational fulfillment is handled separately.</p>
      {error ? <p className="workflow-approval-error" role="alert">{error}</p> : null}
    </div>
  )
}
