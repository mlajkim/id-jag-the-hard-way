import { CheckCheck, Home, RotateCcw, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { consoleHref, displayProduct } from "@/components/navigation/consoleRoute"
import { WorkflowConsoleTemplate } from "@/components/templates/WorkflowConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import { listWorkflowApplications } from "@/features/workflow/api/workflowApplications"
import {
  WORKFLOW_DEMO_MEMBER,
  WORKFLOW_DEMO_ROLES,
} from "@/features/workflow/api/workflowDemoTools"
import { WorkflowDemoActions } from "@/features/workflow/components/WorkflowDemoActions"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function WorkflowDemoToolsRoute({
  params,
}: {
  params: Promise<{ product: string; project: string }>
}) {
  await requireHubSession()
  const { product, project } = await params
  const requests = await listWorkflowApplications()
  const pendingCount = requests.filter(({ status }) => status === "pending").length
  const workflowHomeHref = consoleHref({ project, product, section: "requests" })

  return (
    <WorkflowConsoleTemplate>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href={workflowHomeHref} aria-label="Workflow Platform home"><Home size={14} aria-hidden="true" /></Link>
        <span>/</span>
        <Link href={workflowHomeHref}>{displayProduct(product)}</Link>
        <span>/</span>
        <strong>Demo tools</strong>
      </nav>

      <div className="page-head workflow-page-head">
        <div>
          <span className="workflow-eyebrow">Local demo controls</span>
          <h1 className="page-title">Demo tools</h1>
          <p>Approve the current workflow queue and toggle the fixed API access used by the ID-JAG demo.</p>
        </div>
        <div className="workflow-request-counts" aria-label="Demo queue total">
          <span><CheckCheck size={14} aria-hidden="true" /><strong>{pendingCount}</strong> pending</span>
        </div>
      </div>

      <section className="workflow-request-panel workflow-demo-panel" aria-labelledby="workflow-demo-heading">
        <div className="workflow-panel-heading">
          <div>
            <span>Demo-only operation</span>
            <h2 id="workflow-demo-heading">Bulk approval and direct role access</h2>
          </div>
          <strong>3 roles</strong>
        </div>

        <div className="workflow-demo-layout">
          <div className="workflow-demo-summary">
            <span className="workflow-demo-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
            <div>
              <h3>Grant the demo applicant</h3>
              <p>The approval action ensures the fixed member has all three direct API roles, then records every pending request as approved.</p>
            </div>
          </div>

          <dl className="workflow-demo-targets">
            <div>
              <dt>Member</dt>
              <dd><code>{WORKFLOW_DEMO_MEMBER}</code></dd>
            </div>
            <div>
              <dt>Direct roles</dt>
              <dd>
                <ul>
                  {WORKFLOW_DEMO_ROLES.map((role) => <li key={role}><code>{role}</code></li>)}
                </ul>
              </dd>
            </div>
          </dl>

          <div className="workflow-demo-note">
            <RotateCcw size={15} aria-hidden="true" />
            Reset removes only these three memberships, so the same workflow demo can be run again.
          </div>

          <WorkflowDemoActions pendingCount={pendingCount} />
        </div>
      </section>
    </WorkflowConsoleTemplate>
  )
}
