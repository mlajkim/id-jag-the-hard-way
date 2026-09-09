"use client"

import { CheckCheck, LoaderCircle, RotateCcw, ShieldCheck, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

type ActiveAction = "approve" | "reset" | undefined

type DemoOperationResult = {
  applicationsApproved?: number
  membershipsAdded?: number
  membershipsRemoved?: number
}

export function WorkflowDemoActions({ pendingCount }: { pendingCount: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [activeAction, setActiveAction] = useState<ActiveAction>()
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function approveAllAndGrant() {
    setActiveAction("approve")
    setMessage("")
    setError("")
    try {
      const result = await runDemoOperation("POST")
      setMessage(
        `Approved ${result.applicationsApproved ?? 0} pending ${plural(result.applicationsApproved ?? 0, "application")} and added ${result.membershipsAdded ?? 0} missing role ${plural(result.membershipsAdded ?? 0, "membership")}.`,
      )
      router.refresh()
    } catch (operationError) {
      setError(errorMessage(operationError))
    } finally {
      setActiveAction(undefined)
    }
  }

  async function resetRoles() {
    setActiveAction("reset")
    setMessage("")
    setError("")
    try {
      const result = await runDemoOperation("DELETE")
      dialogRef.current?.close()
      setMessage(
        `Removed ${result.membershipsRemoved ?? 0} demo role ${plural(result.membershipsRemoved ?? 0, "membership")}.`,
      )
      router.refresh()
    } catch (operationError) {
      setError(errorMessage(operationError))
    } finally {
      setActiveAction(undefined)
    }
  }

  async function runDemoOperation(method: "DELETE" | "POST") {
    const response = await fetch("/api/workflow-demo", { method })
    const payload = await response.json().catch(() => ({})) as DemoOperationResult & { error?: unknown }
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : "Demo operation failed")
    }
    return payload
  }

  const busy = activeAction !== undefined

  return (
    <>
      <div className="workflow-demo-actions">
        <button
          className="button primary workflow-demo-approve"
          disabled={busy}
          type="button"
          onClick={approveAllAndGrant}
        >
          {activeAction === "approve"
            ? <LoaderCircle className="spinning" size={15} aria-hidden="true" />
            : <CheckCheck size={15} aria-hidden="true" />}
          {activeAction === "approve"
            ? "Running demo approval..."
            : `Approve all${pendingCount > 0 ? ` (${pendingCount})` : ""} & grant roles`}
        </button>
        <button
          className="button danger workflow-demo-reset"
          disabled={busy}
          type="button"
          onClick={() => {
            setError("")
            dialogRef.current?.showModal()
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset demo roles
        </button>
      </div>

      {message ? (
        <div className="workflow-demo-result" role="status">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}
      {error && activeAction !== "reset" ? (
        <p className="workflow-approval-error" role="alert">{error}</p>
      ) : null}

      <dialog className="workflow-delete-dialog" ref={dialogRef}>
        <div className="workflow-delete-dialog-card">
          <div className="workflow-delete-dialog-head">
            <div>
              <span>Demo reset</span>
              <h2>Remove all three demo memberships?</h2>
            </div>
            <button
              aria-label="Close demo reset confirmation"
              disabled={activeAction === "reset"}
              type="button"
              onClick={() => dialogRef.current?.close()}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="workflow-delete-dialog-body">
            <p>This removes <code>human.idjag-learner</code> from the three direct API roles. It does not delete roles, policies, or workflow records.</p>
            {error ? <p className="workflow-approval-error" role="alert">{error}</p> : null}
            <div className="workflow-delete-dialog-actions">
              <button
                className="button"
                disabled={activeAction === "reset"}
                type="button"
                onClick={() => dialogRef.current?.close()}
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={activeAction === "reset"}
                type="button"
                onClick={resetRoles}
              >
                {activeAction === "reset"
                  ? <LoaderCircle className="spinning" size={14} aria-hidden="true" />
                  : <RotateCcw size={14} aria-hidden="true" />}
                {activeAction === "reset" ? "Removing..." : "Remove memberships"}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  )
}

function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Demo operation failed"
}
