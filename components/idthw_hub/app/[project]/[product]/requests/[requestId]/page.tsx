import { ArrowLeft, CheckCircle2, Clock3, Home } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { consoleHref, decodeRouteParam, displayProduct } from "@/components/navigation/consoleRoute"
import { WorkflowConsoleTemplate } from "@/components/templates/WorkflowConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import { WorkflowApprovalButton } from "@/features/workflow/components/WorkflowApprovalButton"
import {
  getPermissionWorkflowRequest,
  PermissionWorkflowRequestNotFoundError,
} from "@/features/workflow/api/permissionWorkflowRequests"
import type { PermissionWorkflowRequest } from "@/features/workflow/types"

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
  let request: PermissionWorkflowRequest
  try {
    request = await getPermissionWorkflowRequest(requestId)
  } catch (error) {
    if (error instanceof PermissionWorkflowRequestNotFoundError) notFound()
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
          <span className="workflow-eyebrow">Permission request overview</span>
          <div className="workflow-detail-title-row">
            <h1>{request.toolName}</h1>
            <span className="workflow-status" data-status={request.status}>
              {request.status === "approved"
                ? <CheckCircle2 size={13} aria-hidden="true" />
                : <Clock3 size={13} aria-hidden="true" />}
              {request.status === "approved" ? "Approved" : "Pending"}
            </span>
          </div>
          <p>{request.requesterUsername} requested access to {request.serverDisplayName}.</p>
        </div>
      </div>

      <div className="workflow-overview-layout">
        <main className="workflow-overview-main">
          <section className="workflow-overview-card">
            <div className="workflow-card-heading">
              <span>Request</span>
              <h2>Overview</h2>
            </div>
            <dl className="workflow-request-details">
              <Detail label="Requester" value={request.requesterUsername} />
              <Detail label="Athenz principal" value={request.requesterPrincipal} code />
              <Detail label="Project" value={request.project} code />
              <Detail label="MCP server" value={request.serverDisplayName} />
              <Detail label="MCP key" value={request.mcpKeyName} code />
              <Detail label="Tool" value={request.toolName} code />
              <Detail label="Created" value={formatDate(request.createdAt)} />
              <Detail label="Approved" value={request.approvedAt ? formatDate(request.approvedAt) : "Not yet"} />
            </dl>
          </section>

          <section className="workflow-overview-card">
            <div className="workflow-card-heading">
              <span>Changes</span>
              <h2>Requested permissions</h2>
            </div>
            <div className="workflow-permission-list">
              {request.requirements.map((requirement, index) => (
                <div className="workflow-permission-item" key={`requirement:${requirement.member}:${requirement.role}:${index}`}>
                  <span className="workflow-permission-kind">Role membership</span>
                  <strong>{requirement.label}</strong>
                  <dl>
                    <Detail label="Member" value={requirement.member} code compact />
                    <Detail label="Role" value={requirement.role} code compact />
                  </dl>
                </div>
              ))}
              {request.policies.map((policy, index) => (
                <div className="workflow-permission-item" key={`policy:${policy.role}:${policy.action}:${index}`}>
                  <span className="workflow-permission-kind">Policy assertion</span>
                  <strong>{policy.label}</strong>
                  <dl>
                    <Detail label="Effect" value={policy.effect === "ALLOW" ? "Allow" : "Deny"} compact />
                    <Detail label="Action" value={policy.action} code compact />
                    <Detail label="Role" value={policy.role} code compact />
                    <Detail label="Resource" value={policy.resource} code compact />
                  </dl>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="workflow-overview-sidebar">
          <section className="workflow-approval-card">
            <span>Decision</span>
            <h2>{request.status === "approved" ? "Permission granted" : "Review request"}</h2>
            <p>{request.status === "approved"
              ? "The workflow applied and verified the requested Athenz configuration."
              : "Accepting this request applies every listed membership and policy assertion."}</p>
            <WorkflowApprovalButton requestId={request.id} status={request.status} />
          </section>
          <section className="workflow-storage-card">
            <span>Workflow record</span>
            <strong>{request.id}</strong>
            <p>Stored as <code>mcp-permission-request-{request.id}</code> in the central workflow namespace.</p>
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
