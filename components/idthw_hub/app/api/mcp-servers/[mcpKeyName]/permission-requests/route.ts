import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import { fetchPermissionReadiness } from "@/features/permissions/lib/fetchPermissionReadiness"
import { SIGNED_IN_USER_MEMBER } from "@/features/permissions/lib/permissionPreset"
import {
  getMcpServerConfiguration,
  McpResourceNotFoundError,
} from "@/features/registration/api/mcpResources"
import {
  managedMcpAccessDomain,
  managedMcpAccessScope,
} from "@/features/registration/lib/kubernetesManifest"
import { createPermissionWorkflowRequest } from "@/features/workflow/api/permissionWorkflowRequests"
import type {
  PermissionWorkflowPolicy,
  PermissionWorkflowRequirement,
} from "@/features/workflow/types"

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

    const requirements: PermissionWorkflowRequirement[] = group.requirements
      .filter(({ source, status }) => source !== "managed" && status === "missing")
      .map(({ label, member, role, source }) => ({
        label,
        member,
        role,
        source: source as PermissionWorkflowRequirement["source"],
      }))
    const policies: PermissionWorkflowPolicy[] = group.policies
      .filter(({ source, status }) => source === "helper" && status === "missing")
      .map(({ action, effect, label, resource, role }) => ({
        action,
        effect,
        label,
        resource,
        role,
        source: "helper",
      }))
    if (requirements.length === 0 && policies.length === 0) {
      return NextResponse.json({
        approved: true,
        changed: false,
        checksCompleted: 10,
        toolName,
      }, { headers: NO_STORE_HEADERS })
    }

    const requesterPrincipal = group.requirements.find(({ configuredMember }) => (
      configuredMember === SIGNED_IN_USER_MEMBER
    ))?.member
    if (!requesterPrincipal) throw new Error("Unable to resolve the signed-in Athenz principal")

    const result = await createPermissionWorkflowRequest({
      mcpKeyName,
      policies,
      project,
      requesterPrincipal,
      requesterUsername: session.user.username,
      requirements,
      serverDisplayName: configuration.serverName,
      toolName,
    })
    return NextResponse.json({
      checksCompleted: 10,
      created: result.created,
      request: {
        id: result.request.id,
        status: result.request.status,
        toolName: result.request.toolName,
      },
      submitted: true,
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
