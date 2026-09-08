import { parseAthenzRole } from "../../permissions/lib/permissionPreset.ts"
import type {
  NewPermissionWorkflowRequest,
  PermissionWorkflowApprovalReport,
  PermissionWorkflowPolicy,
  PermissionWorkflowRequest,
  PermissionWorkflowRequirement,
} from "../types.ts"

export const PERMISSION_REQUEST_PREFIX = "mcp-permission-request-"
export const PERMISSION_REQUEST_RESOURCE = "permission-request"

const ID_PATTERN = /^\d{14}-[a-f0-9]{8}$/
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/
const PRINCIPAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9][A-Za-z0-9._-]*$/

export function buildPermissionWorkflowConfigMap(request: PermissionWorkflowRequest) {
  const validated = parsePermissionWorkflowRequest(request)
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: `${PERMISSION_REQUEST_PREFIX}${validated.id}`,
      namespace: "mcp-hub",
      labels: {
        "app.kubernetes.io/part-of": "idthw-hub",
        "mcp.idthw.dev/mcp-key": validated.mcpKeyName,
        "mcp.idthw.dev/project": validated.project,
        "mcp.idthw.dev/resource": PERMISSION_REQUEST_RESOURCE,
        "mcp.idthw.dev/status": validated.status,
      },
    },
    data: {
      "request.json": JSON.stringify(validated),
    },
  }
}

export function newPermissionWorkflowRequest(
  input: NewPermissionWorkflowRequest,
  id: string,
  createdAt: string,
): PermissionWorkflowRequest {
  return parsePermissionWorkflowRequest({
    ...input,
    createdAt,
    id,
    status: "pending",
    version: 1,
  })
}

export function approvedPermissionWorkflowRequest(
  request: PermissionWorkflowRequest,
  approvedAt: string,
  approvalReport: PermissionWorkflowApprovalReport,
) {
  return parsePermissionWorkflowRequest({
    ...request,
    approvedAt,
    approvalReport,
    status: "approved",
  })
}

export function parsePermissionWorkflowRequest(value: unknown): PermissionWorkflowRequest {
  const root = requireRecord(value, "permission request")
  assertOnlyKeys(root, [
    "approvedAt",
    "approvalReport",
    "createdAt",
    "id",
    "mcpKeyName",
    "policies",
    "project",
    "requesterPrincipal",
    "requesterUsername",
    "requirements",
    "serverDisplayName",
    "status",
    "toolName",
    "version",
  ], "permission request")
  if (root.version !== 1) throw new Error("Permission request version must be 1")

  const id = requireString(root.id, "permission request id")
  if (!ID_PATTERN.test(id)) throw new Error("Permission request id is invalid")
  const project = requireString(root.project, "permission request project")
  const mcpKeyName = requireString(root.mcpKeyName, "permission request MCP key")
  if (!DNS_LABEL_PATTERN.test(project) || !DNS_LABEL_PATTERN.test(mcpKeyName)) {
    throw new Error("Permission request MCP server reference is invalid")
  }
  const requesterPrincipal = requireString(root.requesterPrincipal, "permission request principal")
  if (!PRINCIPAL_PATTERN.test(requesterPrincipal)) throw new Error("Permission request principal is invalid")
  const requesterUsername = requireString(root.requesterUsername, "permission request username")
  const serverDisplayName = requireDisplayString(root.serverDisplayName, "permission request server name")
  const toolName = requireDisplayString(root.toolName, "permission request tool name")
  const createdAt = requireTimestamp(root.createdAt, "permission request creation time")
  const status = root.status === "pending" || root.status === "approved" ? root.status : undefined
  if (!status) throw new Error("Permission request status is invalid")

  const requirements = requireArray(root.requirements, "permission request requirements")
    .map(parseRequirement)
  const policies = requireArray(root.policies, "permission request policies")
    .map(parsePolicy)
  if (requirements.length === 0 && policies.length === 0) {
    throw new Error("Permission request must contain at least one permission")
  }

  const approvedAt = root.approvedAt === undefined
    ? undefined
    : requireTimestamp(root.approvedAt, "permission request approval time")
  const approvalReport = root.approvalReport === undefined
    ? undefined
    : parseApprovalReport(root.approvalReport)
  if (status === "approved" && (!approvedAt || !approvalReport)) {
    throw new Error("Approved permission request is missing its approval result")
  }
  if (status === "pending" && (approvedAt || approvalReport)) {
    throw new Error("Pending permission request cannot contain an approval result")
  }

  return {
    ...(approvedAt ? { approvedAt } : {}),
    ...(approvalReport ? { approvalReport } : {}),
    createdAt,
    id,
    mcpKeyName,
    policies,
    project,
    requesterPrincipal,
    requesterUsername,
    requirements,
    serverDisplayName,
    status,
    toolName,
    version: 1,
  }
}

function parseRequirement(value: unknown): PermissionWorkflowRequirement {
  const requirement = requireRecord(value, "permission request requirement")
  assertOnlyKeys(requirement, ["label", "member", "role", "source"], "permission request requirement")
  const source = requirement.source === "tool" || requirement.source === "helper"
    ? requirement.source
    : undefined
  if (!source) throw new Error("Permission request requirement source is invalid")
  const role = requireString(requirement.role, "permission request requirement role")
  parseAthenzRole(role)
  const member = requireString(requirement.member, "permission request requirement member")
  if (!PRINCIPAL_PATTERN.test(member)) throw new Error("Permission request requirement member is invalid")
  return {
    label: requireDisplayString(requirement.label, "permission request requirement label"),
    member,
    role,
    source,
  }
}

function parsePolicy(value: unknown): PermissionWorkflowPolicy {
  const policy = requireRecord(value, "permission request policy")
  assertOnlyKeys(policy, ["action", "effect", "label", "resource", "role", "source"], "permission request policy")
  if (policy.source !== "helper") throw new Error("Permission request policy source is invalid")
  if (policy.effect !== "ALLOW" && policy.effect !== "DENY") {
    throw new Error("Permission request policy effect is invalid")
  }
  const role = requireString(policy.role, "permission request policy role")
  parseAthenzRole(role)
  return {
    action: requireString(policy.action, "permission request policy action"),
    effect: policy.effect,
    label: requireDisplayString(policy.label, "permission request policy label"),
    resource: requireString(policy.resource, "permission request policy resource"),
    role,
    source: "helper",
  }
}

function parseApprovalReport(value: unknown): PermissionWorkflowApprovalReport {
  const report = requireRecord(value, "permission request approval report")
  assertOnlyKeys(report, ["changed", "membershipsAdded", "policiesUpdated"], "permission request approval report")
  if (typeof report.changed !== "boolean") throw new Error("Permission request approval result is invalid")
  return {
    changed: report.changed,
    membershipsAdded: requireNonNegativeInteger(report.membershipsAdded, "memberships added"),
    policiesUpdated: requireNonNegativeInteger(report.policiesUpdated, "policies updated"),
  }
}

function requireDisplayString(value: unknown, location: string) {
  const text = requireString(value, location)
  if (text.length > 256 || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${location} is invalid`)
  return text
}

function requireString(value: unknown, location: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${location} is required`)
  return value.trim()
}

function requireTimestamp(value: unknown, location: string) {
  const timestamp = requireString(value, location)
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${location} is invalid`)
  return timestamp
}

function requireNonNegativeInteger(value: unknown, location: string) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${location} is invalid`)
  return Number(value)
}

function requireArray(value: unknown, location: string) {
  if (!Array.isArray(value)) throw new Error(`${location} must be an array`)
  return value
}

function requireRecord(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${location} must be an object`)
  return value as Record<string, unknown>
}

function assertOnlyKeys(value: Record<string, unknown>, keys: string[], location: string) {
  const allowed = new Set(keys)
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key))
  if (unexpected.length > 0) throw new Error(`${location} contains unknown field ${unexpected[0]}`)
}
