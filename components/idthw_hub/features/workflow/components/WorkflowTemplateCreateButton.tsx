"use client"

import { GripVertical, Plus, Trash2, X } from "lucide-react"
import { FormEvent, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type DraftField = {
  clientId: number
  label: string
  options: string[]
  required: boolean
  type: "bullet-list" | "text"
}

export function WorkflowTemplateCreateButton() {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [templateId, setTemplateId] = useState("")
  const [subject, setSubject] = useState("")
  const [applicationContent, setApplicationContent] = useState("")
  const [fields, setFields] = useState<DraftField[]>([])
  const [nextFieldId, setNextFieldId] = useState(1)
  const [draggedFieldId, setDraggedFieldId] = useState<number | null>(null)
  const [dragOverFieldId, setDragOverFieldId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  function openDialog() {
    setError("")
    dialogRef.current?.showModal()
  }

  function closeDialog() {
    if (!isSaving) dialogRef.current?.close()
  }

  function resetForm() {
    setTemplateId("")
    setSubject("")
    setApplicationContent("")
    setFields([])
    setNextFieldId(1)
    setDraggedFieldId(null)
    setDragOverFieldId(null)
    setError("")
  }

  function addField() {
    setFields((current) => [...current, {
      clientId: nextFieldId,
      label: "",
      options: [],
      required: true,
      type: "text",
    }])
    setNextFieldId((current) => current + 1)
  }

  function moveField(targetFieldId: number) {
    if (draggedFieldId === null || draggedFieldId === targetFieldId) return
    setFields((current) => {
      const sourceIndex = current.findIndex(({ clientId }) => clientId === draggedFieldId)
      const targetIndex = current.findIndex(({ clientId }) => clientId === targetFieldId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const reordered = [...current]
      const [dragged] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, dragged)
      return reordered
    })
    setDragOverFieldId(null)
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    setError("")
    setIsSaving(true)

    try {
      const response = await fetch("/api/workflow-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicationContent,
          fields: fields.map(({ label, options, required, type }) => ({
            label,
            options,
            required,
            type,
          })),
          id: templateId,
          subject,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: unknown }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to create template")
      }

      dialogRef.current?.close()
      resetForm()
      router.refresh()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create template")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <button className="button primary workflow-template-create-trigger" type="button" onClick={openDialog}>
        <Plus size={14} aria-hidden="true" />
        Create template
      </button>

      <dialog
        className="workflow-template-dialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (isSaving) event.preventDefault()
        }}
        onClose={() => {
          if (!isSaving) resetForm()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog()
        }}
      >
        <form className="workflow-template-dialog-card" onSubmit={createTemplate}>
          <div className="workflow-template-dialog-head">
            <div>
              <span>Reusable application form</span>
              <h2 id={titleId}>Create workflow template</h2>
            </div>
            <button type="button" aria-label="Close template dialog" disabled={isSaving} onClick={closeDialog}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="workflow-template-form">
            <label>
              <span>Template ID</span>
              <input
                autoFocus
                maxLength={63}
                pattern="[a-z0-9](?:[-a-z0-9]*[a-z0-9])?"
                placeholder="idthw-api-mcp-tools"
                required
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value.toLowerCase())}
              />
              <small>Lowercase letters, numbers, and hyphens. This ID cannot be changed later.</small>
            </label>

            <label>
              <span>Subject</span>
              <input
                maxLength={200}
                placeholder="Request access to the provider service"
                required
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>

            <label>
              <span>Application content</span>
              <textarea
                maxLength={10000}
                placeholder="Describe what applicants should provide and how the request will be handled."
                required
                rows={5}
                value={applicationContent}
                onChange={(event) => setApplicationContent(event.target.value)}
              />
            </label>

            <section className="workflow-template-fields" aria-labelledby={`${titleId}-fields`}>
              <div className="workflow-template-fields-head">
                <div>
                  <strong id={`${titleId}-fields`}>Additional fields</strong>
                  <small>Add only the information this workflow needs.</small>
                </div>
              </div>

              {fields.length > 0 ? (
                <div className="workflow-template-field-list">
                  {fields.map((field, index) => (
                    <div
                      className="workflow-template-field-row"
                      data-dragging={draggedFieldId === field.clientId || undefined}
                      data-drag-over={dragOverFieldId === field.clientId || undefined}
                      key={field.clientId}
                      onDragEnter={() => {
                        if (draggedFieldId !== null && draggedFieldId !== field.clientId) {
                          setDragOverFieldId(field.clientId)
                        }
                      }}
                      onDragOver={(event) => {
                        if (draggedFieldId !== null && draggedFieldId !== field.clientId) {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = "move"
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        moveField(field.clientId)
                      }}
                    >
                      <button
                        className="workflow-template-field-drag"
                        type="button"
                        draggable
                        aria-label={`Move field ${index + 1}`}
                        title="Drag to reorder"
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move"
                          event.dataTransfer.setData("text/plain", String(field.clientId))
                          setDraggedFieldId(field.clientId)
                        }}
                        onDragEnd={() => {
                          setDraggedFieldId(null)
                          setDragOverFieldId(null)
                        }}
                      >
                        <GripVertical size={15} aria-hidden="true" />
                      </button>
                      <label>
                        <span className="sr-only">Field {index + 1} label</span>
                        <input
                          maxLength={120}
                          placeholder={`Field ${index + 1} label`}
                          required
                          value={field.label}
                          onChange={(event) => setFields((current) => current.map((candidate) => (
                            candidate.clientId === field.clientId
                              ? { ...candidate, label: event.target.value }
                              : candidate
                          )))}
                        />
                      </label>
                      <label className="workflow-template-field-type">
                        <span className="sr-only">Field {index + 1} type</span>
                        <select
                          aria-label={`Field ${index + 1} type`}
                          value={field.type}
                          onChange={(event) => {
                            const type = event.target.value === "bullet-list" ? "bullet-list" : "text"
                            setFields((current) => current.map((candidate) => (
                              candidate.clientId === field.clientId
                                ? {
                                    ...candidate,
                                    options: type === "bullet-list"
                                      ? candidate.options.length > 0 ? candidate.options : [""]
                                      : [],
                                    type,
                                  }
                                : candidate
                            )))
                          }}
                        >
                          <option value="text">Plain text</option>
                          <option value="bullet-list">Bullet options</option>
                        </select>
                      </label>
                      <label className="workflow-template-required-toggle">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) => setFields((current) => current.map((candidate) => (
                            candidate.clientId === field.clientId
                              ? { ...candidate, required: event.target.checked }
                              : candidate
                          )))}
                        />
                        Required
                      </label>
                      <button
                        className="workflow-template-field-remove"
                        type="button"
                        aria-label={`Remove field ${index + 1}`}
                        onClick={() => setFields((current) => current.filter(({ clientId }) => clientId !== field.clientId))}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                      {field.type === "bullet-list" ? (
                        <div className="workflow-template-options">
                          <div className="workflow-template-options-head">
                            <div>
                              <strong>Bullet options</strong>
                              <small>The first option is required and cannot be removed.</small>
                            </div>
                            <button
                              className="button"
                              type="button"
                              disabled={field.options.length >= 20}
                              onClick={() => setFields((current) => current.map((candidate) => (
                                candidate.clientId === field.clientId
                                  ? { ...candidate, options: [...candidate.options, ""] }
                                  : candidate
                              )))}
                            >
                              <Plus size={12} aria-hidden="true" />
                              Add option
                            </button>
                          </div>
                          <div className="workflow-template-option-list">
                            {field.options.map((option, optionIndex) => (
                              <div className="workflow-template-option-row" key={`${field.clientId}:${optionIndex}`}>
                                <span className="workflow-template-option-bullet" aria-hidden="true">•</span>
                                <label>
                                  <span className="sr-only">Field {index + 1} option {optionIndex + 1}</span>
                                  <input
                                    maxLength={120}
                                    placeholder={`Option ${optionIndex + 1}`}
                                    required
                                    value={option}
                                    onChange={(event) => setFields((current) => current.map((candidate) => (
                                      candidate.clientId === field.clientId
                                        ? {
                                            ...candidate,
                                            options: candidate.options.map((candidateOption, candidateIndex) => (
                                              candidateIndex === optionIndex ? event.target.value : candidateOption
                                            )),
                                          }
                                        : candidate
                                    )))}
                                  />
                                </label>
                                {optionIndex === 0 ? (
                                  <span className="workflow-template-option-required">Required</span>
                                ) : (
                                  <button
                                    className="workflow-template-option-remove"
                                    type="button"
                                    aria-label={`Remove option ${optionIndex + 1}`}
                                    onClick={() => setFields((current) => current.map((candidate) => (
                                      candidate.clientId === field.clientId
                                        ? {
                                            ...candidate,
                                            options: candidate.options.filter((_, candidateIndex) => candidateIndex !== optionIndex),
                                          }
                                        : candidate
                                    )))}
                                  >
                                    <Trash2 size={13} aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="workflow-template-fields-empty">No additional fields. Applicants will see only the subject and application content.</p>
              )}
              <div className="workflow-template-fields-add">
                <button className="button" type="button" disabled={fields.length >= 30} onClick={addField}>
                  <Plus size={13} aria-hidden="true" />
                  Add field
                </button>
              </div>
            </section>

            {error ? <p className="workflow-template-form-error" role="alert">{error}</p> : null}
          </div>

          <div className="workflow-template-dialog-actions">
            <button className="button" type="button" disabled={isSaving} onClick={closeDialog}>Cancel</button>
            <button className="button primary" type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create template"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
