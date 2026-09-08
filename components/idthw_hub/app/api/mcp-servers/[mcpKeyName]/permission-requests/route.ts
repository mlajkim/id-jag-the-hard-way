import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import { requestToolPermissionAccess } from "@/features/permissions/api/requestToolPermissionAccess"
import { fetchPermissionReadiness } from "@/features/permissions/lib/fetchPermissionReadiness"
import { createZmsRequest } from "@/features/registration/api/mcpManagedAccess"
import {
  getMcpServerConfiguration,
  McpResourceNotFoundError,
} from "@/features/registration/api/mcpResources"
import {
  managedMcpAccessDomain,
  managedMcpAccessScope,
} from "@/features/registration/lib/kubernetesManifest"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mcpKeyName: string }> },
) {
  const session = await auth()
  if (!session?.user?.username) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: NO_STORE_HEADERS },
    )
  }

  const { mcpKeyName } = await params
  const project = request.nextUrl.searchParams.get("project") ?? ""
  if (!DNS_LABEL_PATTERN.test(project) || !DNS_LABEL_PATTERN.test(mcpKeyName)) {
    return NextResponse.json(
      { error: "Invalid MCP server reference" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  let toolName: string
  try {
    toolName = toolNameFromRequest(await request.json())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid permission request" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const configuration = await getMcpServerConfiguration(project, mcpKeyName)
    if (configuration.accessManagement !== "hub" || !configuration.serviceAccount) {
      return NextResponse.json(
        { error: "This MCP server does not use Hub-managed permission requests" },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }

    const readiness = await fetchPermissionReadiness(
      mcpKeyName,
      session.user.username,
      managedMcpAccessScope(project, mcpKeyName),
      managedMcpAccessDomain(project),
      configuration.toolPermissions,
      configuration.serviceAccount,
    )
    if (!readiness) {
      return NextResponse.json(
        { error: "This tool has no permission configuration" },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }
    if (readiness.status === "configuration-error") {
      throw new Error(readiness.message)
    }

    const group = readiness.groups.find((candidate) => candidate.toolName === toolName)
    const customChecks = group
      ? [
          ...group.requirements.filter(({ source }) => source !== "managed"),
          ...group.policies.filter(({ source }) => source === "helper"),
        ]
      : []
    if (!group || customChecks.length === 0) {
      return NextResponse.json(
        { error: "This tool requires no additional permission" },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }
    if (customChecks.some(({ status }) => status === "unavailable")) {
      return NextResponse.json(
        { error: "Athenz permission status is currently unavailable" },
        { status: 503, headers: NO_STORE_HEADERS },
      )
    }

    const report = await requestToolPermissionAccess(
      group,
      await createZmsRequest("MCP Hub tool permission request"),
    )
    return NextResponse.json({
      approved: true,
      checksCompleted: 10,
      ...report,
      toolName,
    }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to request tool permission"
    console.error("Unable to request MCP tool permission", {
      project,
      mcpKeyName,
      toolName,
      message: message.trim().replace(/\s+/g, " ").slice(0, 300),
    })
    return NextResponse.json(
      { error: error instanceof McpResourceNotFoundError ? message : "Unable to request tool permission" },
      {
        status: error instanceof McpResourceNotFoundError ? 404 : 500,
        headers: NO_STORE_HEADERS,
      },
    )
  }
}

function toolNameFromRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Permission request must be an object")
  }
  const toolName = typeof (value as Record<string, unknown>).toolName === "string"
    ? (value as Record<string, string>).toolName.trim()
    : ""
  if (!toolName || toolName.length > 256 || /[\u0000-\u001f\u007f]/.test(toolName)) {
    throw new Error("Tool name is invalid")
  }
  return toolName
}
