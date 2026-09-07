import {
  ArrowRight,
  Box,
  Cable,
  Container,
  Layers3,
  Server as ServerIcon,
  ShieldCheck,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { CopyButton } from "@/components/atoms/CopyButton"
import { catalogServerSuffix, consoleHref, decodeRouteParam } from "@/components/navigation/consoleRoute"
import { ConsoleTemplate } from "@/components/templates/ConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import {
  McpServerDetailBreadcrumb,
  McpServerDetailHeader,
  McpServerDetailTabs,
} from "@/features/catalog/components/McpServerClientConfigurationPage"
import { McpServerStatusBadge } from "@/features/catalog/components/McpServerStatusBadge"
import { fetchCatalog } from "@/features/catalog/lib/fetchCatalog"
import { listLiveMcpTools, resolveMcpDisplayUrl } from "@/features/catalog/lib/mcpTools"
import {
  fetchPermissionDefinition,
  type PermissionDefinition,
} from "@/features/permissions/lib/fetchPermissionReadiness"
import type {
  PermissionPolicyRequirement,
  PermissionRequirement,
} from "@/features/permissions/types/permissions"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function McpServerOverviewRoute({
  params,
}: {
  params: Promise<{ project: string; product: string; id: string }>
}) {
  const session = await requireHubSession()
  const { project, product, id } = await params
  const serverId = decodeRouteParam(id)
  const catalog = await fetchCatalog()
  const server = catalog.servers.find((item) => item.id === serverId)

  if (!server) notFound()

  const displayName = server.alias ?? server.name
  const [toolsResult, permissionDefinition] = await Promise.all([
    listLiveMcpTools(server),
    fetchPermissionDefinition(
      server.routeId,
      session.user.username,
      server.accessScope,
      server.accessAudience,
      server.toolPermissionOverrides,
      server.serviceAccount,
    ),
  ])
  const clientHref = consoleHref({
    project,
    product,
    section: "catalog",
    suffix: catalogServerSuffix(server.id, "client-configuration"),
  })
  const toolsHref = consoleHref({
    project,
    product,
    section: "catalog",
    suffix: catalogServerSuffix(server.id, "tools"),
  })
  const editHref = consoleHref({
    project,
    product,
    section: "mcp-server",
    suffix: `${encodeURIComponent(server.name)}/edit`,
  })
  const templateHref = server.templateKey
    ? consoleHref({
        project,
        product,
        section: "mcp-template",
        suffix: encodeURIComponent(server.templateKey),
      })
    : undefined
  const mcpEndpoint = resolveMcpDisplayUrl(server)
  const toolCount = toolsResult.error ? "Unavailable" : String(toolsResult.tools.length)
  const managedAccess = managedAccessDetails(permissionDefinition)

  return (
    <ConsoleTemplate>
      <McpServerDetailBreadcrumb project={project} product={product} displayName={displayName} currentView="Overview" />
      <McpServerDetailHeader project={project} product={product} server={server} displayName={displayName} />
      <McpServerDetailTabs project={project} product={product} serverId={server.id} active="overview" />

      <div className="resource-overview-layout">
        <main className="resource-overview-main">
          <section className="resource-overview-card resource-overview-hero" aria-labelledby="server-overview-heading">
            <div className="resource-overview-card-head">
              <div>
                <span className="resource-overview-eyebrow">Running MCP server</span>
                <h2 id="server-overview-heading">Overview</h2>
              </div>
            </div>
            <p className="resource-overview-description">{server.description}</p>
            <dl className="resource-overview-stats">
              <div>
                <dt>Status</dt>
                <dd><McpServerStatusBadge status={server.status} message={server.statusMessage} /></dd>
                <small>{server.statusMessage}</small>
              </div>
              <div>
                <dt>Tools</dt>
                <dd>{toolCount}</dd>
                <small>{toolsResult.error ? "Live discovery is unavailable" : "Discovered from this server"}</small>
              </div>
              <div>
                <dt>Access</dt>
                <dd className="resource-overview-options">
                  <Option active={server.accessManagement === "hub"}>Hub-managed</Option>
                  <Option active={server.accessManagement === "server"}>Server-managed</Option>
                </dd>
                <small>{server.accessManagement === "hub" ? "MCP Hub verifies access" : "The MCP server verifies access"}</small>
              </div>
              <div>
                <dt>Visibility</dt>
                <dd className="resource-overview-options">
                  <Option active={(server.visibility ?? "personal") === "personal"}>Personal</Option>
                  <Option active={server.visibility === "project"}>Project</Option>
                </dd>
                <small>{server.project}</small>
              </div>
            </dl>
          </section>

          <section className="resource-overview-card" aria-labelledby="server-endpoints-heading">
            <div className="resource-overview-card-head">
              <div className="resource-overview-heading-with-icon">
                <Cable size={18} aria-hidden="true" />
                <div>
                  <span className="resource-overview-eyebrow">Connection</span>
                  <h2 id="server-endpoints-heading">Endpoints</h2>
                </div>
              </div>
            </div>
            <div className="resource-overview-endpoints">
              <EndpointRow label="MCP endpoint" value={mcpEndpoint} />
              <EndpointRow label="Internal proxy" value={server.proxyUrl} />
            </div>
          </section>

          <section className="resource-overview-card" aria-labelledby="server-runtime-heading">
            <div className="resource-overview-card-head">
              <div className="resource-overview-heading-with-icon">
                <Container size={18} aria-hidden="true" />
                <div>
                  <span className="resource-overview-eyebrow">Kubernetes</span>
                  <h2 id="server-runtime-heading">Runtime</h2>
                </div>
              </div>
            </div>
            <dl className="resource-overview-details">
              <Detail label="Namespace" value={server.namespace} mono />
              <Detail label="Deployment" value={server.name} mono />
              <Detail label="Container image" value={server.containerImage} mono wide />
              <Detail label="Container port" value={server.containerPort?.toString()} mono />
              <Detail label="Ready replicas" value={`${server.readyReplicas ?? 0} / ${server.desiredReplicas ?? 1}`} />
              <Detail label="Transport" value={formatTransport(server.transport)} />
              <Detail label="Path" value={server.path} mono />
              <Detail label="IAM service account" value={server.serviceAccount} mono wide />
              <Detail label="Created from" value={server.creationMethod === "template" ? "MCP template" : "Direct setup"} />
              {server.templateKey ? <Detail label="Template key" value={server.templateKey} mono /> : null}
              {server.createdAt ? <Detail label="Created" value={formatDate(server.createdAt)} /> : null}
            </dl>
          </section>

          {server.accessAudience ? (
            <section className="resource-overview-card" aria-labelledby="server-access-heading">
              <div className="resource-overview-card-head">
                <div className="resource-overview-heading-with-icon">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <div>
                    <span className="resource-overview-eyebrow">Authorization</span>
                    <h2 id="server-access-heading">Access model</h2>
                  </div>
                </div>
                {server.accessManagement === "hub" && managedAccess ? (
                  <span className="resource-overview-count">
                    {permissionCountLabel(managedAccess.requirements.length, managedAccess.policies.length)}
                  </span>
                ) : null}
              </div>
              <dl className="resource-overview-details">
                <Detail label="Management" value={server.accessManagement === "hub" ? "MCP Hub managed" : "MCP server managed"} />
                <Detail label="Audience" value={server.accessAudience} mono wide />
              </dl>
              {server.accessManagement === "hub" ? (
                <ManagedAccessPermissions definition={permissionDefinition} details={managedAccess} />
              ) : (
                <p className="resource-overview-empty">Authorization permissions are managed and enforced by this MCP server.</p>
              )}
            </section>
          ) : null}
        </main>

        <aside className="resource-overview-sidebar" aria-label="MCP server actions">
          <section className="resource-overview-card resource-overview-actions">
            <div className="resource-overview-card-head">
              <div>
                <span className="resource-overview-eyebrow">Next steps</span>
                <h2>Quick links</h2>
              </div>
            </div>
            <OverviewLink href={clientHref} icon={<Cable size={17} />} label="Client configuration" copy="Request access and connect a client" />
            <OverviewLink href={toolsHref} icon={<Wrench size={17} />} label="Explore tools" copy="View live tools and permissions" />
            {server.project === project ? (
              <OverviewLink href={editHref} icon={<ServerIcon size={17} />} label="Edit MCP server" copy="Update runtime and configuration" />
            ) : null}
            {templateHref ? (
              <OverviewLink href={templateHref} icon={<Layers3 size={17} />} label="View template" copy={server.templateKey ?? "Open source template"} />
            ) : null}
          </section>

          <section className="resource-overview-card resource-overview-identity" aria-labelledby="server-identity-heading">
            <div className="resource-overview-heading-with-icon">
              <Box size={17} aria-hidden="true" />
              <h2 id="server-identity-heading">Resource identity</h2>
            </div>
            <dl>
              <div><dt>Route ID</dt><dd><code>{server.routeId}</code></dd></div>
              <div><dt>Catalog ID</dt><dd><code>{server.id}</code></dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </ConsoleTemplate>
  )
}

function EndpointRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="resource-overview-endpoint">
      <div><span>{label}</span><code>{value}</code></div>
      <CopyButton value={value} label={`Copy ${label}`} />
    </div>
  )
}

function Detail({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string
  value?: string
  mono?: boolean
  wide?: boolean
}) {
  return (
    <div className={wide ? "wide" : undefined}>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value || "Not configured"}</dd>
    </div>
  )
}

function Option({ active, children }: { active: boolean; children: ReactNode }) {
  return <span>{active ? <strong>{children}</strong> : children}</span>
}

type ManagedAccessDetails = {
  policies: PermissionPolicyRequirement[]
  requirements: PermissionRequirement[]
}

function ManagedAccessPermissions({
  definition,
  details,
}: {
  definition: PermissionDefinition | null
  details: ManagedAccessDetails | null
}) {
  if (definition && "status" in definition) {
    return (
      <div className="managed-access-message" data-status="missing">
        <strong>Managed permission configuration could not be loaded</strong>
        <span>{definition.message}</span>
      </div>
    )
  }
  if (!details || details.requirements.length === 0) {
    return <p className="resource-overview-empty">No managed MCP access permissions are configured.</p>
  }

  const policiesByRole = new Map<string, PermissionPolicyRequirement[]>()
  for (const policy of details.policies) {
    policiesByRole.set(policy.role, [...(policiesByRole.get(policy.role) ?? []), policy])
  }

  return (
    <div className="managed-access-permissions">
      <div className="managed-access-heading">
        <div>
          <span className="resource-overview-eyebrow">Raw permission definition</span>
          <h3>Role memberships and exchange policies</h3>
        </div>
        <p>Read-only members, roles, and policy rules generated for this MCP server. Permission readiness is checked during client configuration.</p>
      </div>
      <div className="resource-overview-table-wrap">
        <table className="managed-access-table">
          <thead>
            <tr>
              <th>Required access</th>
              <th>Member type</th>
              <th>Member</th>
              <th>Role</th>
              <th>Effect</th>
              <th>Action</th>
              <th>Resource</th>
            </tr>
          </thead>
          <tbody>
            {details.requirements.map((requirement) => {
              const policies = policiesByRole.get(requirement.role) ?? []
              return (
                <tr key={`${requirement.configuredMember}:${requirement.role}`}>
                  <td>{requirement.label}</td>
                  <td><span className="managed-access-member-type">{managedMemberType(requirement)}</span></td>
                  <td><code>{requirement.configuredMember}</code></td>
                  <td><code>{requirement.role}</code></td>
                  {policies.length > 0 ? (
                    <>
                      <td><PolicyValues policies={policies} value={(policy) => policy.effect === "ALLOW" ? "Allow" : "Deny"} /></td>
                      <td><PolicyValues policies={policies} value={(policy) => policy.action} mono /></td>
                      <td><PolicyValues policies={policies} value={(policy) => policy.resource} mono /></td>
                    </>
                  ) : (
                    <td className="managed-access-no-policy" colSpan={3}>No exchange policy attached</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PolicyValues({
  mono = false,
  policies,
  value,
}: {
  mono?: boolean
  policies: PermissionPolicyRequirement[]
  value: (policy: PermissionPolicyRequirement) => string
}) {
  return (
    <div className="permission-dialog-rule-values">
      {policies.map((policy) => {
        const content = value(policy)
        const key = `${policy.effect}:${policy.action}:${policy.resource}`
        return mono
          ? <code key={key}>{content}</code>
          : <span key={key}>{content}</span>
      })}
    </div>
  )
}

function managedAccessDetails(definition: PermissionDefinition | null): ManagedAccessDetails | null {
  if (!definition || "status" in definition) return null
  const requirements = new Map<string, PermissionRequirement>()
  const policies = new Map<string, PermissionPolicyRequirement>()
  for (const group of definition.groups) {
    for (const requirement of group.requirements.filter(({ source }) => source === "managed")) {
      requirements.set(`${requirement.configuredMember}\n${requirement.role}`, requirement)
    }
    for (const policy of (group.policies ?? []).filter(({ source }) => source === "managed")) {
      policies.set(`${policy.effect}\n${policy.action}\n${policy.role}\n${policy.resource}`, policy)
    }
  }
  return { requirements: [...requirements.values()], policies: [...policies.values()] }
}

function managedMemberType(requirement: PermissionRequirement) {
  if (requirement.configuredMember === "<signed_in_user>") return "Signed-in user"
  if (requirement.label.startsWith("MCP Gateway")) return "MCP Gateway service"
  if (requirement.label.startsWith("MCP service")) return "MCP IAM service"
  return "Service account"
}

function permissionCountLabel(roles: number, policies: number) {
  const values: string[] = []
  if (roles > 0) values.push(`${roles} ${roles === 1 ? "Role" : "Roles"}`)
  if (policies > 0) values.push(`${policies} ${policies === 1 ? "Policy" : "Policies"}`)
  return values.join(" · ") || "No permissions"
}

function OverviewLink({
  href,
  icon,
  label,
  copy,
}: {
  href: string
  icon: ReactNode
  label: string
  copy: string
}) {
  return (
    <Link className="resource-overview-action" href={href}>
      <span className="resource-overview-action-icon" aria-hidden="true">{icon}</span>
      <span><strong>{label}</strong><small>{copy}</small></span>
      <ArrowRight size={15} aria-hidden="true" />
    </Link>
  )
}

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("-", " ")
}

function formatTransport(value?: string) {
  return value === "streamable-http" ? "Streamable HTTP" : formatLabel(value ?? "Not configured")
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date)
}
