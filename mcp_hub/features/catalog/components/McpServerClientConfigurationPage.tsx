import { ChevronLeft, ChevronRight, ClipboardList, Home } from "lucide-react"
import Link from "next/link"
import { CopyButton } from "@/components/atoms/CopyButton"
import { ServerLogo } from "@/components/atoms/ServerLogo"
import { catalogServerSuffix, consoleHref, displayProduct } from "@/components/navigation/consoleRoute"
import { ClientConfiguration } from "@/components/molecules/ClientConfiguration"
import { resolveMcpDisplayUrl } from "@/features/catalog/lib/mcpTools"
import type { McpServer } from "@/features/catalog/types/catalog"

export function McpServerDetailBreadcrumb({
  project,
  product,
  displayName,
  currentView,
}: {
  project: string
  product: string
  displayName: string
  currentView: string
}) {
  const catalogHref = consoleHref({ project, product, section: "catalog" })

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link href={catalogHref} aria-label="Catalog home">
        <Home size={14} aria-hidden="true" />
      </Link>
      <Link href={catalogHref}>{project}</Link>
      <ChevronRight size={14} aria-hidden="true" />
      <Link href={catalogHref}>{displayProduct(product)}</Link>
      <ChevronRight size={14} aria-hidden="true" />
      <Link href={catalogHref}>Catalog</Link>
      <ChevronRight size={14} aria-hidden="true" />
      <Link href={catalogHref}>Public MCP server</Link>
      <ChevronRight size={14} aria-hidden="true" />
      <span>{displayName}</span>
      <ChevronRight size={14} aria-hidden="true" />
      <strong>{currentView}</strong>
    </nav>
  )
}

export function McpServerDetailHeader({
  project,
  product,
  server,
  displayName,
}: {
  project: string
  product: string
  server: McpServer
  displayName: string
}) {
  return (
    <div className="detail-page-head">
      <div className="detail-title-row">
        <Link className="back-link" href={consoleHref({ project, product, section: "catalog" })} aria-label="Back to catalog">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <ServerLogo server={server} />
        <h1 className="detail-title">{displayName}</h1>
        <span className="status-badge">Active</span>
      </div>

      {(server.pattern || server.authMode) && (
        <p className="section-copy">
          {server.pattern ? `Pattern: ${server.pattern}` : ""}
          {server.pattern && server.authMode ? " · " : ""}
          {server.authMode ? `Authentication: ${server.authMode === "dpop-connector" ? "DPoP connector" : "OAuth"}` : ""}
        </p>
      )}

      <div className="actions">
        <button className="button" type="button" disabled>
          <ClipboardList size={14} aria-hidden="true" />
          Document
        </button>
      </div>
    </div>
  )
}

export function McpServerDetailTabs({
  project,
  product,
  serverId,
  active,
}: {
  project: string
  product: string
  serverId: string
  active: "client-configuration" | "tools"
}) {
  return (
    <div className="tabs detail-tabs" aria-label="MCP server detail views">
      <Link
        className={`tab ${active === "client-configuration" ? "active" : ""}`}
        href={consoleHref({ project, product, section: "catalog", suffix: catalogServerSuffix(serverId, "client-configuration") })}
      >
        Client configuration
      </Link>
      <button className="tab" type="button" disabled>
        Overview
      </button>
      <Link
        className={`tab ${active === "tools" ? "active" : ""}`}
        href={consoleHref({ project, product, section: "catalog", suffix: catalogServerSuffix(serverId, "tools") })}
      >
        Tools
      </Link>
    </div>
  )
}

export function McpServerUrlSection({ mcpServerUrl }: { mcpServerUrl: string }) {
  return (
    <section className="detail-section" aria-labelledby="mcp-server-heading">
      <h2 id="mcp-server-heading" className="section-title">
        MCP server
      </h2>
      <div className="url-card">
        <div className="url-label">URL</div>
        <div className="url-value-row">
          <code>{mcpServerUrl}</code>
          <CopyButton value={mcpServerUrl} label="Copy MCP server URL" />
        </div>
      </div>
    </section>
  )
}

// Annotations author the command with a literal "${REPO_ROOT}" placeholder
// (see register-mcp-hub-metadata.sh) instead of "$PWD", because this text is
// copied into an arbitrary terminal, not run from the repository root the
// way the tutorial's own documented commands are - "$PWD" would silently
// resolve to whatever directory the user happened to be in when they pasted
// it. This mirrors how ClientConfiguration.tsx's connector paths are
// resolved through MCP_HUB_CONNECTOR_REPOSITORY_ROOT.
function resolveClientPrerequisite(command: string, repositoryRoot: string | undefined) {
  if (!repositoryRoot?.trim()) return command
  return command.replaceAll("${REPO_ROOT}", repositoryRoot.trim().replace(/[\\/]+$/, ""))
}

function ClientPrerequisiteNotice({ command }: { command: string }) {
  return (
    <div className="connector-prerequisite">
      <div>
        <span className="config-eyebrow">Prerequisite</span>
        <strong>Run this before connecting</strong>
      </div>
      <div className="connector-prerequisite-command">
        <code>{command}</code>
        <CopyButton value={command} label="Copy prerequisite command" />
      </div>
    </div>
  )
}

export function JsonConfigurationSection({ server }: { server: McpServer }) {
  const mcpServerUrl = resolveMcpDisplayUrl(server)
  const repositoryRoot = process.env.MCP_HUB_CONNECTOR_REPOSITORY_ROOT
  const prerequisite = server.clientPrerequisite
    ? resolveClientPrerequisite(server.clientPrerequisite, repositoryRoot)
    : undefined

  if (server.authMode === "dpop-connector") {
    return (
      <section className="detail-section config-section" aria-labelledby="connector-config-heading">
        <h2 id="connector-config-heading" className="section-title">Connector configuration</h2>
        <p className="section-copy">
          This MCP endpoint uses the local DPoP connector. Choose your MCP client below to generate the matching stdio configuration.
        </p>
        {prerequisite && <ClientPrerequisiteNotice command={prerequisite} />}
        <ClientConfiguration
          serverName={server.name}
          mcpServerUrl={mcpServerUrl}
          connectorCommand={server.connectorCommand ?? `node ${server.name}/client/src/index.js`}
          connectorRepositoryRoot={repositoryRoot}
        />
      </section>
    )
  }

  return (
    <section className="detail-section config-section" aria-labelledby="json-config-heading">
      <h2 id="json-config-heading" className="section-title">
        Client configuration
      </h2>
      <p className="section-copy">Add this configuration to your MCP client settings.</p>
      {prerequisite && <ClientPrerequisiteNotice command={prerequisite} />}

      <ClientConfiguration serverName={server.name} mcpServerUrl={mcpServerUrl} />
    </section>
  )
}
