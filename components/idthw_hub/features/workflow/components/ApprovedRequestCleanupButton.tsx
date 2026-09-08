"use client"

import { LoaderCircle, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

export function ApprovedRequestCleanupButton({ count }: { count: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState("")

  async function deleteApproved() {
    setIsDeleting(true)
    setError("")
    try {
      const response = await fetch("/api/permission-requests/approved", { method: "DELETE" })
      const payload = await response.json().catch(() => ({})) as { error?: unknown }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to delete approved requests")
      }
      dialogRef.current?.close()
      router.refresh()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete approved requests")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <button
        className="button workflow-delete-approved-trigger"
        disabled={count === 0}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Trash2 size={13} aria-hidden="true" />
        Delete all approved
      </button>

      <dialog className="workflow-delete-dialog" ref={dialogRef}>
        <div className="workflow-delete-dialog-card">
          <div className="workflow-delete-dialog-head">
            <div>
              <span>Workflow cleanup</span>
              <h2>Delete all approved requests?</h2>
            </div>
            <button
              aria-label="Close cleanup confirmation"
              disabled={isDeleting}
              type="button"
              onClick={() => dialogRef.current?.close()}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="workflow-delete-dialog-body">
            <p>This permanently removes {count} approved workflow {count === 1 ? "record" : "records"}. Pending requests and Athenz permissions are not changed.</p>
            {error ? <p className="workflow-approval-error" role="alert">{error}</p> : null}
            <div className="workflow-delete-dialog-actions">
              <button className="button" disabled={isDeleting} type="button" onClick={() => dialogRef.current?.close()}>
                Cancel
              </button>
              <button className="button danger" disabled={isDeleting} type="button" onClick={deleteApproved}>
                {isDeleting ? <LoaderCircle className="spinning" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                {isDeleting ? "Deleting..." : "Delete approved records"}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  )
}
