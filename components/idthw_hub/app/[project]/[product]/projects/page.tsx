import { Check, ChevronRight, FolderKanban, Home } from "lucide-react"
import Link from "next/link"
import {
  consoleHref,
  displayProduct,
  productHref,
  WORKFLOW_PRODUCT,
} from "@/components/navigation/consoleRoute"
import { ConsoleTemplate } from "@/components/templates/ConsoleTemplate"
import { WorkflowConsoleTemplate } from "@/components/templates/WorkflowConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import { fetchProjectNamespaces } from "@/features/projects/api/projectNamespaces"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function ProjectsRoute({
  params,
}: {
  params: Promise<{ project: string; product: string }>
}) {
  const { project, product } = await params
  if (product !== WORKFLOW_PRODUCT) await requireHubSession()
  const response = await fetchProjectNamespaces()
  const productHomeHref = productHref(project, product)
  const projectsHref = consoleHref({ project, product, section: "projects" })

  const content = (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href={productHomeHref} aria-label={`${displayProduct(product)} home`}><Home size={14} aria-hidden="true" /></Link>
        <Link href={productHomeHref}>{displayProduct(product)}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={projectsHref}><strong>Projects</strong></Link>
      </nav>

      <div className="page-head projects-page-head">
        <div>
          <span className="projects-eyebrow">Kubernetes-backed workspace</span>
          <h1 className="page-title">Projects</h1>
          <p>Choose a Kubernetes namespace to use as your project in {displayProduct(product)}.</p>
        </div>
        <div className="projects-total">
          <FolderKanban size={17} aria-hidden="true" />
          <span><strong>{response.projects.length}</strong> projects</span>
        </div>
      </div>

      {response.error ? <p className="catalog-error" role="status">{response.error}</p> : null}

      <section className="projects-panel" aria-labelledby="projects-list-heading">
        <div className="projects-panel-heading">
          <div>
            <span>Available namespaces</span>
            <h2 id="projects-list-heading">Project directory</h2>
          </div>
          <small>System namespaces are hidden.</small>
        </div>

        <div className="projects-table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project (K8s namespace)</th>
                <th>Status</th>
                <th>Created</th>
                <th><span className="sr-only">Select</span></th>
              </tr>
            </thead>
            <tbody>
              {response.projects.length > 0 ? response.projects.map((candidate) => {
                const current = candidate.name === project
                const active = candidate.status === "Active"
                return (
                  <tr key={candidate.name} data-current={current || undefined}>
                    <td>
                      <div className="project-name-cell">
                        <span className="project-icon" aria-hidden="true"><FolderKanban size={16} /></span>
                        <div>
                          <strong>{candidate.name}</strong>
                          {current ? <small><Check size={11} aria-hidden="true" /> Current project</small> : null}
                        </div>
                      </div>
                    </td>
                    <td><span className="project-status" data-status={candidate.status.toLowerCase()}>{candidate.status}</span></td>
                    <td>{candidate.createdAt ? formatDate(candidate.createdAt) : "—"}</td>
                    <td>
                      {current ? (
                        <span className="project-current-action">Selected</span>
                      ) : active ? (
                        <Link className="project-select-action" href={productHref(candidate.name, product)}>
                          Select project
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="project-unavailable-action">Unavailable</span>
                      )}
                    </td>
                  </tr>
                )
              }) : (
                <tr><td className="empty-cell" colSpan={4}>No project namespaces found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )

  return product === WORKFLOW_PRODUCT
    ? <WorkflowConsoleTemplate>{content}</WorkflowConsoleTemplate>
    : <ConsoleTemplate>{content}</ConsoleTemplate>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value))
}
