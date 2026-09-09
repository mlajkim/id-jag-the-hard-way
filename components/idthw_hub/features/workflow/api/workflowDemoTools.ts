import { requestToolPermissionAccess } from "../../permissions/api/requestToolPermissionAccess.ts"
import {
  createZmsRequest,
  type ZmsRequest,
} from "../../registration/api/mcpManagedAccess.ts"

export const WORKFLOW_DEMO_MEMBER = "human.idjag-learner"
export const WORKFLOW_DEMO_ROLES = [
  "api:role.docs-getter",
  "api:role.docs-poster",
  "api:role.docs-deleter",
] as const

export async function grantWorkflowDemoRoles(configuredRequest?: ZmsRequest) {
  const requestZms = configuredRequest
    ?? await createZmsRequest("Workflow Platform demo bulk approval")
  const report = await requestToolPermissionAccess({
    policies: [],
    requirements: WORKFLOW_DEMO_ROLES.map((role) => ({
      member: WORKFLOW_DEMO_MEMBER,
      role,
      source: "tool" as const,
      status: "missing" as const,
    })),
  }, requestZms)

  return {
    member: WORKFLOW_DEMO_MEMBER,
    membershipsAdded: report.membershipsAdded,
    roles: [...WORKFLOW_DEMO_ROLES],
  }
}

export async function resetWorkflowDemoRoles(configuredRequest?: ZmsRequest) {
  const requestZms = configuredRequest
    ?? await createZmsRequest("Workflow Platform demo role reset")
  let membershipsRemoved = 0

  for (const scopedRole of WORKFLOW_DEMO_ROLES) {
    const [domain, role] = scopedRole.split(":role.")
    const rolePath = `/domain/${encodeURIComponent(domain)}/role/${encodeURIComponent(role)}`
    const existing = await requestZms("GET", rolePath)
    if (existing.status === 404) throw new Error(`Required Athenz role ${scopedRole} does not exist`)
    if (existing.status !== 200) throw unexpectedStatus(`checking ${scopedRole}`, existing.status)
    if (!roleContains(existing.body, WORKFLOW_DEMO_MEMBER)) continue

    const memberPath = `${rolePath}/member/${encodeURIComponent(WORKFLOW_DEMO_MEMBER)}`
    const removed = await requestZms("DELETE", memberPath)
    if (!isSuccess(removed.status) && removed.status !== 404) {
      throw unexpectedStatus(`removing ${WORKFLOW_DEMO_MEMBER} from ${scopedRole}`, removed.status)
    }

    const verified = await requestZms("GET", rolePath)
    if (verified.status !== 200 || roleContains(verified.body, WORKFLOW_DEMO_MEMBER)) {
      throw new Error(`Unable to verify removal of ${WORKFLOW_DEMO_MEMBER} from ${scopedRole}`)
    }
    if (removed.status !== 404) membershipsRemoved += 1
  }

  return {
    member: WORKFLOW_DEMO_MEMBER,
    membershipsRemoved,
    roles: [...WORKFLOW_DEMO_ROLES],
  }
}

function roleContains(body: string, member: string) {
  let payload: unknown
  try {
    payload = JSON.parse(body) as unknown
  } catch {
    throw new Error("ZMS returned an invalid Athenz role")
  }
  if (!isRecord(payload)) throw new Error("ZMS returned an invalid Athenz role")
  const roleMembers = Array.isArray(payload.roleMembers) ? payload.roleMembers : []
  const members = Array.isArray(payload.members) ? payload.members : []
  return roleMembers.some((value) => isRecord(value) && value.memberName === member)
    || members.includes(member)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isSuccess(status: number) {
  return status >= 200 && status < 300
}

function unexpectedStatus(operation: string, status: number) {
  return new Error(`ZMS returned HTTP ${status || "unknown"} while ${operation}`)
}
