import { ArrowLeft, CheckCircle2, Clock3, Home } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { consoleHref, decodeRouteParam, displayProduct } from "@/components/navigation/consoleRoute"
import { WorkflowConsoleTemplate } from "@/components/templates/WorkflowConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import { WorkflowApprovalButton } from "@/features/workflow/components/WorkflowApprovalButton"
import {
  getWorkflowApplication,
  WorkflowApplicationNotFoundError,
} from "@/features/workflow/api/workflowApplications"
import type { WorkflowApplication } from "@/features/workflow/types"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function PermissionRequestOverviewRoute({
  params,
}: {
  params: Promise<{ product: string; project: string; requestId: string }>
}) {
  await requireHubSession()
  const { product, project, requestId: encodedRequestId } = await params
  const requestId = decodeRouteParam(encodedRequestId)
  let request: WorkflowApplication
  try {
    request = await getWorkflowApplication(requestId)
  } catch (error) {
    if (error instanceof WorkflowApplicationNotFoundError) notFound()
    throw error
  }
  const requestsHref = consoleHref({ project, product, section: "requests" })

  return (
    <WorkflowConsoleTemplate>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href={requestsHref} aria-label="Workflow Platform home"><Home size={14} aria-hidden="true" /></Link>
        <span>/</span>
        <Link href={requestsHref}>{displayProduct(product)}</Link>
        <span>/</span>
        <Link href={requestsHref}>Permission requests</Link>
        <span>/</span>
        <strong>{request.id}</strong>
      </nav>

      <div className="workflow-detail-head">
        <Link className="back-link" href={requestsHref} aria-label="Back to permission requests">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div>
          <span className="workflow-eyebrow">Workflow application overview</span>
          <div className="workflow-detail-title-row">
            <h1>{request.subject}</h1>
            <span className="workflow-status" data-status={request.status}>
              {request.status === "approved"
                ? <CheckCircle2 size={13} aria-hidden="true" />
                : <Clock3 size={13} aria-hidden="true" />}
              {request.status === "approved" ? "Approved" : "Pending"}
            </span>
          </div>
          <p>
            {request.createdBy} submitted this application using template {request.templateId},
            version {request.templateVersion}.
          </p>
        </div>
      </div>

      <div className="workflow-overview-layout">
        <main className="workflow-overview-main">
          <section className="workflow-overview-card">
            <div className="workflow-card-heading">
              <span>Submission</span>
              <h2>Application responses</h2>
            </div>
            {request.answers.length > 0 ? (
              <div className="workflow-application-response-wrap">
                <table className="workflow-application-response-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.answers.map((answer) => (
                      <tr key={answer.fieldId}>
                        <th scope="row">{answer.label}</th>
                        <td>{answer.value || <span>Not provided</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="workflow-permission-list">
                <p className="workflow-registration-no-fields">This application has no additional fields.</p>
              </div>
            )}
          </section>
        </main>

        <aside className="workflow-overview-sidebar">
          <section className="workflow-overview-card workflow-overview-metadata-card">
            <div className="workflow-card-heading">
              <span>Request</span>
              <h2>Overview</h2>
            </div>
            <dl className="workflow-request-details">
              <Detail label="Applicant" value={request.createdBy} />
              <Detail label="Template ID" value={request.templateId} code />
              <Detail label="Template version" value={String(request.templateVersion)} />
              {request.operatorProcedureUrl ? (
                <div>
                  <dt>Operational link</dt>
                  <dd>
                    <a
                      className="workflow-view-link"
                      href={request.operatorProcedureUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open operational link
                    </a>
                  </dd>
                </div>
              ) : null}
              <Detail label="Created" value={formatDate(request.createdAt)} />
              <Detail label="Approved" value={request.approvedAt ? formatDate(request.approvedAt) : "Not yet"} />
              <Detail label="Approved by" value={request.approvedBy ?? "Not yet"} />
              <Detail label="Application ID" value={request.id} code />
            </dl>
          </section>
          <section className="workflow-approval-card">
            <span>Decision</span>
            <h2>{request.status === "approved" ? "Application approved" : "Review application"}</h2>
            <p>{request.status === "approved"
              ? "The approval decision is recorded. Operational fulfillment is handled separately."
              : "Approving records the decision only. It does not change memberships, policies, or other infrastructure."}</p>
            <WorkflowApprovalButton requestId={request.id} status={request.status} />
          </section>
          <section className="workflow-storage-card">
            <span>Workflow record</span>
            <strong>{request.id}</strong>
            <p>Stored as <code>workflow-application-{request.id}</code> in the central workflow namespace.</p>
          </section>
        </aside>
      </div>
    </WorkflowConsoleTemplate>
  )
}

function Detail({
  code = false,
  compact = false,
  label,
  value,
}: {
  code?: boolean
  compact?: boolean
  label: string
  value: string
}) {
  return (
    <div className={compact ? "compact" : undefined}>
      <dt>{label}</dt>
      <dd>{code ? <code>{value}</code> : value}</dd>
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
