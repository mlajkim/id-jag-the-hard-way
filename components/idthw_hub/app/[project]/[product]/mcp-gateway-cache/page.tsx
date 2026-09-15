import { ChevronRight, Home } from "lucide-react"
import Link from "next/link"
import { consoleHref, displayProduct } from "@/components/navigation/consoleRoute"
import { ConsoleTemplate } from "@/components/templates/ConsoleTemplate"
import { requireHubSession } from "@/features/auth/lib/session"
import { McpGatewayCacheDashboard } from "@/features/catalog/components/McpGatewayCacheDashboard"
import { getMcpGatewayCacheStatus } from "@/features/catalog/lib/mcpGatewayCacheStatus"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function McpGatewayCacheRoute({
  params,
}: {
  params: Promise<{ project: string; product: string }>
}) {
  await requireHubSession()
  const { project, product } = await params
  const status = await getMcpGatewayCacheStatus()
  const catalogHref = consoleHref({ project, product, section: "catalog" })
  const cacheHref = consoleHref({ project, product, section: "mcp-gateway-cache" })

  return (
    <ConsoleTemplate>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href={catalogHref} aria-label="Catalog home"><Home size={14} aria-hidden="true" /></Link>
        <Link href={catalogHref}>{project}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={catalogHref}>{displayProduct(product)}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={cacheHref}><strong>MCP Gateway cache</strong></Link>
      </nav>

      <div className="page-head gateway-cache-page-head">
        <div>
          <span className="gateway-cache-eyebrow">Runtime visibility</span>
          <h1 className="page-title">MCP Gateway cache</h1>
          <p>Inspect active users and the expiry of their scoped Athenz access-token and ID-JAG cache entries.</p>
        </div>
      </div>

      <McpGatewayCacheDashboard initialStatus={status} />
    </ConsoleTemplate>
  )
}
