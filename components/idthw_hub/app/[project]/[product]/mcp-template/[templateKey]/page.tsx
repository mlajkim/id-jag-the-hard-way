import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Container,
  ExternalLink,
  FileText,
  Home,
  KeyRound,
  Layers3,
  Pencil,
  Plus,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { McpResourceLogo } from "@/components/atoms/ServerLogo"
import { consoleHref, decodeRouteParam, displayProduct } from "@/components/navigation/consoleRoute"
import { ConsoleTemplate } from "@/components/templates/ConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import { listMcpIconOptions, resolveMcpIconSrc } from "@/features/mcp-servers/lib/mcpIcons"
import {
  getMcpTemplate,
  McpTemplateNotFoundError,
} from "@/features/mcp-templates/api/kubernetesTemplates"
import type { McpTemplateInput } from "@/features/mcp-templates/types"
import type { ToolPermissionSettings } from "@/features/permissions/types/permissions"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DNS_LABEL_PATTERN = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/

export default async function McpTemplateOverviewRoute({
  params,
}: {
  params: Promise<{ project: string; product: string; templateKey: string }>
}) {
  await requireHubSession()
  const { project, product, templateKey: encodedTemplateKey } = await params
  const templateKey = decodeRouteParam(encodedTemplateKey)
  if (!DNS_LABEL_PATTERN.test(project) || !DNS_LABEL_PATTERN.test(templateKey)) notFound()

  let template: McpTemplateInput
  try {
    template = await getMcpTemplate(project, templateKey)
  } catch (error) {
    if (error instanceof McpTemplateNotFoundError) notFound()
    throw error
  }

  const iconOptions = await listMcpIconOptions()
  const catalogHref = consoleHref({ project, product, section: "catalog" })
  const templatesHref = consoleHref({ project, product, section: "mcp-template" })
  const createServerHref = `${consoleHref({
    project,
    product,
    section: "mcp-server",
    suffix: "create",
  })}?templateKey=${encodeURIComponent(template.templateKey)}`
  const editHref = consoleHref({
    project,
    product,
    section: "mcp-template",
    suffix: `${encodeURIComponent(template.templateKey)}/edit`,
  })
  const permissionRows = permissionSummaryRows(template.toolPermissions)
  const permissionTotals = permissionRows.reduce(
    (totals, row) => ({
      directRoles: totals.directRoles + row.directRoles,
      helperRoles: totals.helperRoles + row.helperRoles,
      policies: totals.policies + row.policies,
    }),
    { directRoles: 0, helperRoles: 0, policies: 0 },
  )

  return (
    <ConsoleTemplate>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href={catalogHref} aria-label="Catalog home"><Home size={14} aria-hidden="true" /></Link>
        <Link href={catalogHref}>{project}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={catalogHref}>{displayProduct(product)}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={templatesHref}>MCP template</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{template.name}</span>
        <ChevronRight size={14} aria-hidden="true" />
        <strong>Overview</strong>
      </nav>

      <div className="detail-page-head template-overview-head">
        <div className="detail-title-row">
          <Link className="back-link" href={templatesHref} aria-label="Back to MCP templates">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <McpResourceLogo
            iconSrc={resolveMcpIconSrc(template.iconId, iconOptions)}
            logoText={templateInitials(template.name)}
          />
          <div>
            <span className="resource-overview-eyebrow">MCP template</span>
            <h1 className="detail-title">{template.name}</h1>
          </div>
        </div>
        <div className="actions">
          <Link className="button" href={editHref}><Pencil size={14} aria-hidden="true" />Edit template</Link>
          <Link className="button mcp-create-primary" href={createServerHref}><Plus size={14} aria-hidden="true" />Create MCP server</Link>
        </div>
      </div>

      <div className="tabs detail-tabs" aria-label="MCP template detail views">
        <span className="tab active">Overview</span>
      </div>

      <div className="resource-overview-layout">
        <main className="resource-overview-main">
          <section className="resource-overview-card resource-overview-hero" aria-labelledby="template-overview-heading">
            <div className="resource-overview-card-head">
              <div>
                <span className="resource-overview-eyebrow">Reusable server definition</span>
                <h2 id="template-overview-heading">Overview</h2>
              </div>
            </div>
            <p className="resource-overview-description">
              {template.description || "No description has been added to this MCP template."}
            </p>
            <dl className="resource-overview-stats template-overview-stats">
              <Stat label="Source" value="Container registry" copy="Reusable runtime image" />
              <Stat label="Transport" value="Streamable HTTP" copy={template.path} />
              <Stat label="Environment" value={String(template.environmentVariables.length)} copy="Configured variables" />
              <Stat label="Tool defaults" value={String(permissionRows.length)} copy="Tools with permission settings" />
            </dl>
          </section>

          <section className="resource-overview-card" aria-labelledby="template-source-heading">
            <div className="resource-overview-card-head">
              <div className="resource-overview-heading-with-icon">
                <Container size={18} aria-hidden="true" />
                <div>
                  <span className="resource-overview-eyebrow">Container registry</span>
                  <h2 id="template-source-heading">Runtime source</h2>
                </div>
              </div>
            </div>
            <dl className="resource-overview-details">
              <Detail label="Container image" value={template.image} mono wide />
              <Detail label="Target port" value={template.port} mono />
              <Detail label="Transport" value="Streamable HTTP" />
              <Detail label="Path" value={template.path} mono />
              <Detail label="Container command" value={template.command || "Image default"} mono wide />
              <div className="wide">
                <dt>Container arguments</dt>
                <dd>
                  {template.arguments.length > 0 ? (
                    <ol className="resource-overview-arguments">
                      {template.arguments.map((argument, index) => <li key={`${index}-${argument}`}><code>{argument}</code></li>)}
                    </ol>
                  ) : "Image defaults"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="resource-overview-card" aria-labelledby="template-env-heading">
            <div className="resource-overview-card-head">
              <div className="resource-overview-heading-with-icon">
                <KeyRound size={18} aria-hidden="true" />
                <div>
                  <span className="resource-overview-eyebrow">Server configuration</span>
                  <h2 id="template-env-heading">Environment variables</h2>
                </div>
              </div>
              <span className="resource-overview-count">{template.environmentVariables.length}</span>
            </div>
            {template.environmentVariables.length > 0 ? (
              <div className="resource-overview-table-wrap">
                <table className="resource-overview-table">
                  <thead><tr><th>Key</th><th>Requirement</th><th>Type</th><th>Description</th><th>Default</th></tr></thead>
                  <tbody>
                    {template.environmentVariables.map((variable) => (
                      <tr key={variable.key}>
                        <td><code>{variable.key}</code></td>
                        <td>{variable.required ? "Required" : "Optional"}</td>
                        <td>{variable.secret ? "Secret" : "Plain text"}</td>
                        <td>{variable.description || "—"}</td>
                        <td>{variable.secret ? "Provided during server creation" : variable.defaultValue || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="resource-overview-empty">No environment variables are configured.</p>}
          </section>

          <section className="resource-overview-card" aria-labelledby="template-permissions-heading">
            <div className="resource-overview-card-head">
              <div className="resource-overview-heading-with-icon">
                <ShieldCheck size={18} aria-hidden="true" />
                <div>
                  <span className="resource-overview-eyebrow">Defaults inherited by new servers</span>
                  <h2 id="template-permissions-heading">Tool permissions</h2>
                </div>
              </div>
              {permissionRows.length > 0 ? (
                <span className="resource-overview-count">
                  {pluralize(permissionTotals.directRoles + permissionTotals.helperRoles, "role")} · {pluralize(permissionTotals.policies, "policy", "policies")}
                </span>
              ) : null}
            </div>
            <dl className="resource-overview-details">
              <Detail
                label="Default for unlisted tools"
                value={template.toolPermissions?.defaultPermission === "none"
                  ? "No additional permission"
                  : "Not defined"}
              />
            </dl>
            {permissionRows.length > 0 ? (
              <div className="resource-overview-table-wrap">
                <table className="resource-overview-table permission-summary-table">
                  <thead><tr><th>Tool</th><th>Direct roles</th><th>Helper roles</th><th>Policies</th></tr></thead>
                  <tbody>
                    {permissionRows.map((row) => (
                      <tr key={row.toolName}>
                        <td><code>{row.toolName}</code></td>
                        {row.noAdditionalPermission ? (
                          <td colSpan={3}>No additional permission required</td>
                        ) : (
                          <>
                            <td>{row.directRoles || "—"}</td>
                            <td>{row.helperRoles || "—"}</td>
                            <td>{row.policies || "—"}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="resource-overview-empty">{template.toolPermissions?.defaultPermission === "none"
              ? "No per-tool overrides. Every tool uses the no-additional-permission default."
              : "No tool permission defaults are configured."}</p>}
          </section>
        </main>

        <aside className="resource-overview-sidebar" aria-label="MCP template information">
          <section className="resource-overview-card resource-overview-actions">
            <div className="resource-overview-card-head">
              <div>
                <span className="resource-overview-eyebrow">Use this template</span>
                <h2>Actions</h2>
              </div>
            </div>
            <OverviewLink href={createServerHref} icon={<Plus size={17} />} label="Create MCP server" copy="Start with these defaults" />
            <OverviewLink href={editHref} icon={<Pencil size={17} />} label="Edit template" copy="Update reusable settings" />
          </section>

          <section className="resource-overview-card resource-overview-identity" aria-labelledby="template-details-heading">
            <div className="resource-overview-heading-with-icon">
              <Layers3 size={17} aria-hidden="true" />
              <h2 id="template-details-heading">Template details</h2>
            </div>
            <dl>
              <div><dt>Template key</dt><dd><code>{template.templateKey}</code></dd></div>
              <div><dt>Project (K8s namespace)</dt><dd><code>{template.project}</code></dd></div>
              <div><dt>Visibility</dt><dd>Project</dd></div>
            </dl>
          </section>

          <section className="resource-overview-card resource-overview-reference" aria-labelledby="template-reference-heading">
            <div className="resource-overview-heading-with-icon">
              <FileText size={17} aria-hidden="true" />
              <h2 id="template-reference-heading">Documentation</h2>
            </div>
            {template.documentation ? (
              <a href={template.documentation} target="_blank" rel="noreferrer">
                Open documentation <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : <p>No documentation link has been added.</p>}
          </section>
        </aside>
      </div>
    </ConsoleTemplate>
  )
}

function Stat({ label, value, copy }: { label: string; value: string; copy: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd><small>{copy}</small></div>
}

function Detail({ label, value, mono = false, wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return <div className={wide ? "wide" : undefined}><dt>{label}</dt><dd className={mono ? "mono" : undefined}>{value}</dd></div>
}

function OverviewLink({ href, icon, label, copy }: { href: string; icon: ReactNode; label: string; copy: string }) {
  return (
    <Link className="resource-overview-action" href={href}>
      <span className="resource-overview-action-icon" aria-hidden="true">{icon}</span>
      <span><strong>{label}</strong><small>{copy}</small></span>
      <ArrowRight size={15} aria-hidden="true" />
    </Link>
  )
}

function permissionSummaryRows(settings?: ToolPermissionSettings) {
  return Object.entries(settings?.tools ?? {}).map(([toolName, tool]) => {
    let helperRoles = 0
    let policies = 0
    for (const requirement of tool.requirements) {
      if (requirement.exchangeHelperRequirements) {
        helperRoles += requirement.exchangeHelperRequirements.length
        policies += requirement.exchangeHelperRequirements.reduce(
          (total, helper) => total + (helper.policies?.length ?? (helper.policy ? 1 : 0)),
          0,
        )
      } else if (requirement.includeExchangeHelpers) {
        helperRoles += 2
        policies += 2
      }
    }
    return {
      directRoles: tool.requirements.length,
      helperRoles,
      noAdditionalPermission: tool.requirements.length === 0,
      policies,
      toolName,
    }
  })
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function templateInitials(name: string) {
  return name.split(/[-_\s]+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
}
