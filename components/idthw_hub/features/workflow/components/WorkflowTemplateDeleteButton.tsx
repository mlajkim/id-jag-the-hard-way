"use client"

import { Trash2, X } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"

export function WorkflowTemplateDeleteButton({
  subject,
  templateId,
}: {
  subject: string
  templateId: string
}) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const confirmationMatches = confirmation === templateId

  function closeDialog() {
    if (!isDeleting) dialogRef.current?.close()
  }

  async function deleteTemplate() {
    if (!confirmationMatches || isDeleting) return
    setError("")
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/workflow-templates/${encodeURIComponent(templateId)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: unknown }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to delete template")
      }
      dialogRef.current?.close()
      router.refresh()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete template")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <button
        className="workflow-template-delete-trigger"
        type="button"
        aria-label={`Delete ${subject}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        <Trash2 size={14} aria-hidden="true" />
        Delete
      </button>

      <dialog
        className="workflow-template-delete-dialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (isDeleting) event.preventDefault()
        }}
        onClose={() => {
          setConfirmation("")
          setError("")
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog()
        }}
      >
        <div className="workflow-template-delete-card">
          <div className="workflow-template-dialog-head">
            <div>
              <span>Delete form template</span>
              <h2 id={titleId}>{subject}</h2>
            </div>
            <button type="button" aria-label="Close deletion dialog" disabled={isDeleting} onClick={closeDialog}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="workflow-template-delete-body">
            <p>This permanently deletes the template ConfigMap. Existing applications are not changed.</p>
            <label>
              Enter <code>{templateId}</code> to confirm.
              <input
                autoComplete="off"
                value={confirmation}
                disabled={isDeleting}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            {error ? <p className="workflow-template-form-error" role="alert">{error}</p> : null}
          </div>
          <div className="workflow-template-dialog-actions">
            <button className="button" type="button" disabled={isDeleting} onClick={closeDialog}>Cancel</button>
            <button
              className="button workflow-template-delete-confirm"
              type="button"
              disabled={!confirmationMatches || isDeleting}
              onClick={() => void deleteTemplate()}
            >
              <Trash2 size={14} aria-hidden="true" />
              {isDeleting ? "Deleting..." : "Delete template"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
