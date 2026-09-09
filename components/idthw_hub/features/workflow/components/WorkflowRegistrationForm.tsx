"use client"

import { CheckCircle2, Send } from "lucide-react"
import { type FormEvent, useState } from "react"
import type { ApplicantWorkflowFormTemplate } from "@/features/workflow/types"

export function WorkflowRegistrationForm({ template }: { template: ApplicantWorkflowFormTemplate }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [applicationId, setApplicationId] = useState("")

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setError("")
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const answers = Object.fromEntries(template.fields.map(({ id }) => [
      id,
      String(formData.get(id) ?? ""),
    ]))

    try {
      const response = await fetch(
        `/api/workflow-templates/${encodeURIComponent(template.id)}/applications`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers, templateVersion: template.version }),
        },
      )
      const payload = await response.json().catch(() => ({})) as {
        application?: { id?: unknown }
        error?: unknown
      }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to submit application")
      }
      if (typeof payload.application?.id !== "string") throw new Error("Application response is invalid")
      setApplicationId(payload.application.id)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit application")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (applicationId) {
    return (
      <div className="workflow-registration-complete" role="status">
        <CheckCircle2 size={25} aria-hidden="true" />
        <div>
          <strong>Application submitted</strong>
          <p>Your application ID is <code>{applicationId}</code>.</p>
        </div>
      </div>
    )
  }

  return (
    <form autoComplete="off" className="workflow-registration-form" onSubmit={submitApplication}>
      {template.fields.length > 0 ? (
        <div className="workflow-registration-fields">
          {template.fields.map((field) => field.type === "bullet-list" ? (
            <fieldset className="workflow-registration-field" key={field.id}>
              <legend>
                {field.label}
                {field.required ? <span>Required</span> : <small>Optional</small>}
              </legend>
              <div className="workflow-registration-options">
                {field.options.map((option, index) => (
                  <label key={`${field.id}:${index}`}>
                    <input
                      autoComplete="off"
                      name={field.id}
                      required={field.required && index === 0}
                      type="radio"
                      value={option}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <label className="workflow-registration-field" key={field.id}>
              <span className="workflow-registration-label">
                {field.label}
                {field.required ? <strong>Required</strong> : <small>Optional</small>}
              </span>
              <input autoComplete="off" maxLength={10000} name={field.id} required={field.required} type="text" />
            </label>
          ))}
        </div>
      ) : (
        <p className="workflow-registration-no-fields">This application does not require any additional information.</p>
      )}

      {error ? <p className="workflow-template-form-error" role="alert">{error}</p> : null}

      <div className="workflow-registration-actions">
        <button className="button primary" type="submit" disabled={isSubmitting}>
          <Send size={14} aria-hidden="true" />
          {isSubmitting ? "Submitting..." : "Submit application"}
        </button>
      </div>
    </form>
  )
}
