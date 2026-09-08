import { CheckCircle2, Clock3, Home, Inbox } from "lucide-react"
import Link from "next/link"
import { consoleHref, displayProduct } from "@/components/navigation/consoleRoute"
import { WorkflowConsoleTemplate } from "@/components/templates/WorkflowConsoleTemplate"
import { listPermissionWorkflowRequests } from "@/features/workflow/api/permissionWorkflowRequests"
import { ApprovedRequestCleanupButton } from "@/features/workflow/components/ApprovedRequestCleanupButton"
import { WorkflowRequestRefreshButton } from "@/features/workflow/components/WorkflowRequestRefreshButton"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function PermissionRequestsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ product: string; project: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { product, project } = await params
  const requestedStatus = (await searchParams).status
  const activeStatus = requestedStatus === "approved" ? "approved" : "pending"
  const requests = await listPermissionWorkflowRequests()
  const requestsHref = consoleHref({ project, product, section: "requests" })
  const pendingCount = requests.filter(({ status }) => status === "pending").length
  const approvedCount = requests.length - pendingCount
  const visibleRequests = requests.filter(({ status }) => status === activeStatus)

  return (
    <WorkflowConsoleTemplate>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href={requestsHref} aria-label="Workflow Platform home"><Home size={14} aria-hidden="true" /></Link>
        <span>/</span>
        <Link href={requestsHref}>{displayProduct(product)}</Link>
        <span>/</span>
        <strong>Permission requests</strong>
      </nav>

      <div className="page-head workflow-page-head">
        <div>
          <span className="workflow-eyebrow">Open approval workflow</span>
          <h1 className="page-title">Permission requests</h1>
          <p>Review MCP tool-access requests and apply approved Athenz changes.</p>
        </div>
        <div className="workflow-request-counts" aria-label="Permission request actions and totals">
          <WorkflowRequestRefreshButton />
          <span><Clock3 size={14} aria-hidden="true" /><strong>{pendingCount}</strong> pending</span>
          <span><CheckCircle2 size={14} aria-hidden="true" /><strong>{approvedCount}</strong> approved</span>
        </div>
      </div>

      <section className="workflow-request-panel" aria-labelledby="workflow-request-list-heading">
        <div className="workflow-panel-heading">
          <div>
            <span>Queue</span>
            <h2 id="workflow-request-list-heading">MCP permission workflow</h2>
          </div>
          <strong>{requests.length} requests</strong>
        </div>

        <div className="workflow-request-tabs-row">
          <div className="workflow-request-tabs" role="tablist" aria-label="Permission request status">
            <Link
              aria-selected={activeStatus === "pending"}
              className={activeStatus === "pending" ? "active" : ""}
              href={requestsHref}
              role="tab"
            >
              Pending <span>{pendingCount}</span>
            </Link>
            <Link
              aria-selected={activeStatus === "approved"}
              className={activeStatus === "approved" ? "active" : ""}
              href={`${requestsHref}?status=approved`}
              role="tab"
            >
              Approved / Done <span>{approvedCount}</span>
            </Link>
          </div>
          {activeStatus === "approved" ? <ApprovedRequestCleanupButton count={approvedCount} /> : null}
        </div>

        {visibleRequests.length > 0 ? (
          <div className="workflow-table-wrap">
            <table className="workflow-request-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Requester</th>
                  <th>Project</th>
                  <th>MCP server</th>
                  <th>Tool</th>
                  <th>Created</th>
                  <th><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((request) => (
                  <tr key={request.id}>
                    <td><WorkflowStatus status={request.status} /></td>
                    <td>
                      <strong>{request.requesterUsername}</strong>
                      <small>{request.requesterPrincipal}</small>
                    </td>
                    <td><code>{request.project}</code></td>
                    <td>{request.serverDisplayName}</td>
                    <td><code>{request.toolName}</code></td>
                    <td>{formatDate(request.createdAt)}</td>
                    <td>
                      <Link
                        className="workflow-view-link"
                        href={consoleHref({ project, product, section: "requests", suffix: request.id })}
                      >
                        View request
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workflow-empty-state">
            <Inbox size={24} aria-hidden="true" />
            <strong>{activeStatus === "pending" ? "No pending requests" : "No approved requests"}</strong>
            <p>{activeStatus === "pending"
              ? "Requests submitted from MCP Hub will appear here automatically."
              : "Approved requests remain here until you delete the completed records."}</p>
          </div>
        )}
      </section>
    </WorkflowConsoleTemplate>
  )
}

function WorkflowStatus({ status }: { status: "approved" | "pending" }) {
  return (
    <span className="workflow-status" data-status={status}>
      {status === "approved"
        ? <CheckCircle2 size={13} aria-hidden="true" />
        : <Clock3 size={13} aria-hidden="true" />}
      {status === "approved" ? "Approved" : "Pending"}
    </span>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
