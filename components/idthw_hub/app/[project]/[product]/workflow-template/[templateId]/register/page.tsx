import { ArrowLeft, ChevronRight, Home } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { consoleHref, decodeRouteParam, displayProduct } from "@/components/navigation/consoleRoute"
import { WorkflowConsoleTemplate } from "@/components/templates/WorkflowConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import {
  getWorkflowFormTemplate,
  WorkflowFormTemplateNotFoundError,
} from "@/features/workflow/api/workflowFormTemplates"
import { WorkflowRegistrationForm } from "@/features/workflow/components/WorkflowRegistrationForm"
import { workflowFormTemplateForApplicant } from "@/features/workflow/lib/workflowFormTemplate"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function WorkflowTemplateRegistrationRoute({
  params,
}: {
  params: Promise<{ product: string; project: string; templateId: string }>
}) {
  await requireHubSession()
  const { product, project, templateId: encodedTemplateId } = await params
  const templateId = decodeRouteParam(encodedTemplateId)
  let template
  try {
    template = await getWorkflowFormTemplate(templateId)
  } catch (error) {
    if (error instanceof WorkflowFormTemplateNotFoundError) notFound()
    throw error
  }
  const templatesHref = consoleHref({ project, product, section: "workflow-template" })

  return (
    <WorkflowConsoleTemplate>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href={templatesHref} aria-label="Workflow Platform home"><Home size={14} aria-hidden="true" /></Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={templatesHref}>{displayProduct(product)}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={templatesHref}>Form templates</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <strong>{template.id}</strong>
      </nav>

      <div className="workflow-registration-head">
        <Link className="back-link" href={templatesHref} aria-label="Back to form templates">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div>
          <span className="workflow-eyebrow">Workflow registration</span>
          <h1 className="page-title">{template.subject}</h1>
          <p>{template.applicationContent}</p>
          <p><code>{template.id}</code> · Version {template.version}</p>
        </div>
      </div>

      <section className="workflow-registration-card" aria-label={`${template.subject} registration form`}>
        <WorkflowRegistrationForm template={workflowFormTemplateForApplicant(template)} />
      </section>
    </WorkflowConsoleTemplate>
  )
}
