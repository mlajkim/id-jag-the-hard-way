import { FileText, Home, LayoutTemplate } from "lucide-react"
import Link from "next/link"
import { consoleHref, displayProduct } from "@/components/navigation/consoleRoute"
import { WorkflowConsoleTemplate } from "@/components/templates/WorkflowConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import { listWorkflowFormTemplates } from "@/features/workflow/api/workflowFormTemplates"
import { WorkflowTemplateCreateButton } from "@/features/workflow/components/WorkflowTemplateCreateButton"
import { WorkflowTemplateDeleteButton } from "@/features/workflow/components/WorkflowTemplateDeleteButton"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function WorkflowTemplatesRoute({
  params,
}: {
  params: Promise<{ product: string; project: string }>
}) {
  await requireHubSession()
  const { product, project } = await params
  const templatesHref = consoleHref({ project, product, section: "workflow-template" })
  let templates = [] as Awaited<ReturnType<typeof listWorkflowFormTemplates>>
  let loadError = ""
  try {
    templates = await listWorkflowFormTemplates()
  } catch {
    loadError = "Unable to load workflow form templates from Kubernetes."
  }

  return (
    <WorkflowConsoleTemplate>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href={templatesHref} aria-label="Workflow Platform home"><Home size={14} aria-hidden="true" /></Link>
        <span>/</span>
        <Link href={templatesHref}>{displayProduct(product)}</Link>
        <span>/</span>
        <strong>Form templates</strong>
      </nav>

      <div className="page-head workflow-page-head">
        <div>
          <span className="workflow-eyebrow">Reusable application forms</span>
          <h1 className="page-title">Form templates</h1>
          <p>Create simple application forms that other products can reference by template ID.</p>
        </div>
        <WorkflowTemplateCreateButton />
      </div>

      {loadError ? <p className="catalog-error" role="status">{loadError}</p> : null}

      <section className="workflow-request-panel" aria-labelledby="workflow-template-list-heading">
        <div className="workflow-panel-heading">
          <div>
            <span>ConfigMap-backed registry</span>
            <h2 id="workflow-template-list-heading">Workflow templates</h2>
          </div>
          <strong>{templates.length} templates</strong>
        </div>

        {templates.length > 0 ? (
          <div className="workflow-table-wrap">
            <table className="workflow-template-table">
              <thead>
                <tr>
                  <th>Template ID</th>
                  <th>Subject</th>
                  <th>Application content</th>
                  <th>Fields</th>
                  <th>Created by</th>
                  <th>Created</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td><code>{template.id}</code></td>
                    <td><strong>{template.subject}</strong></td>
                    <td><span className="workflow-template-content-preview">{template.applicationContent}</span></td>
                    <td>
                      <span className="workflow-template-field-count">
                        {template.fields.length} {template.fields.length === 1 ? "field" : "fields"}
                      </span>
                    </td>
                    <td><strong>{template.createdBy}</strong></td>
                    <td>{formatDate(template.createdAt)}</td>
                    <td>
                      <WorkflowTemplateDeleteButton subject={template.subject} templateId={template.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : loadError ? null : (
          <div className="workflow-empty-state">
            <LayoutTemplate size={24} aria-hidden="true" />
            <strong>No form templates yet</strong>
            <p>Create a template with a stable ID for future workflow applications.</p>
            <FileText size={16} aria-hidden="true" />
          </div>
        )}
      </section>
    </WorkflowConsoleTemplate>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
