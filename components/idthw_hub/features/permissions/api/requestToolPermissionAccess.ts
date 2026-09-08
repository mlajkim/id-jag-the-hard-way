import { createHash } from "node:crypto"
import { parseAthenzRole } from "../lib/permissionPreset.ts"
import { parseZmsPolicy, policyAssertionKey } from "../lib/zmsPolicy.ts"
import type {
  PermissionPolicyRequirementCheck,
  PermissionReadinessGroup,
  PermissionRequirementCheck,
} from "../types/permissions.ts"
import type { ZmsRequest } from "../../registration/api/mcpManagedAccess.ts"

const MAX_POLICY_NAME_LENGTH = 192

export type ToolPermissionAccessReport = {
  changed: boolean
  membershipsAdded: number
  policiesUpdated: number
}

export async function requestToolPermissionAccess(
  group: PermissionReadinessGroup,
  requestZms: ZmsRequest,
): Promise<ToolPermissionAccessReport> {
  const requirements = group.requirements.filter(({ source }) => source !== "managed")
  const policies = group.policies.filter(({ source }) => source === "helper")
  const unavailable = [...requirements, ...policies].some(({ status }) => status === "unavailable")
  if (unavailable) throw new Error("Athenz permission status is currently unavailable")

  let membershipsAdded = 0
  for (const requirement of requirements.filter(({ status }) => status === "missing")) {
    if (await ensureRoleMember(requestZms, requirement)) membershipsAdded += 1
  }

  let policiesUpdated = 0
  for (const policy of policies.filter(({ status }) => status === "missing")) {
    if (await ensurePolicyAssertion(requestZms, policy)) policiesUpdated += 1
  }

  return {
    changed: membershipsAdded > 0 || policiesUpdated > 0,
    membershipsAdded,
    policiesUpdated,
  }
}

async function ensureRoleMember(
  requestZms: ZmsRequest,
  requirement: PermissionRequirementCheck,
) {
  const { domain, role } = parseAthenzRole(requirement.role)
  const rolePath = `/domain/${encodeURIComponent(domain)}/role/${encodeURIComponent(role)}`
  const existing = await requestZms("GET", rolePath)
  if (existing.status === 404) throw new Error(`Required Athenz role ${requirement.role} does not exist`)
  if (existing.status !== 200) throw unexpectedStatus(`checking ${requirement.role}`, existing.status)
  if (roleContains(existing.body, requirement.member)) return false

  const memberPath = `${rolePath}/member/${encodeURIComponent(requirement.member)}`
  const added = await requestZms("PUT", memberPath, {
    memberName: requirement.member,
    roleName: role,
  })
  if (!isSuccess(added.status) && added.status !== 409) {
    throw unexpectedStatus(`adding ${requirement.member} to ${requirement.role}`, added.status)
  }

  const verified = await requestZms("GET", rolePath)
  if (verified.status !== 200 || !roleContains(verified.body, requirement.member)) {
    throw new Error(`Unable to verify ${requirement.member} in ${requirement.role}`)
  }
  return isSuccess(added.status)
}

async function ensurePolicyAssertion(
  requestZms: ZmsRequest,
  policy: PermissionPolicyRequirementCheck,
) {
  const { domain, role } = parseAthenzRole(policy.role)
  const rolePath = `/domain/${encodeURIComponent(domain)}/role/${encodeURIComponent(role)}`
  const roleResponse = await requestZms("GET", rolePath)
  if (roleResponse.status === 404) throw new Error(`Required Athenz role ${policy.role} does not exist`)
  if (roleResponse.status !== 200) throw unexpectedStatus(`checking ${policy.role}`, roleResponse.status)

  const policyName = permissionPolicyName(role, policy.action, policy.resource)
  const policyPath = `/domain/${encodeURIComponent(domain)}/policy/${encodeURIComponent(policyName)}`
  const existing = await requestZms("GET", policyPath)
  let assertions: ReturnType<typeof parseZmsPolicy> = []
  if (existing.status === 200) assertions = parseZmsPolicy(existing.body)
  else if (existing.status !== 404) throw unexpectedStatus(`checking ${domain}:policy.${policyName}`, existing.status)

  const expected = {
    action: policy.action,
    effect: policy.effect,
    resource: policy.resource,
    role: policy.role,
  }
  const expectedKey = policyAssertionKey(expected)
  if (assertions.some((assertion) => policyAssertionKey(assertion) === expectedKey)) return false

  const updated = await requestZms("PUT", policyPath, {
    name: `${domain}:policy.${policyName}`,
    assertions: [...assertions, expected],
  })
  if (!isSuccess(updated.status) && updated.status !== 409) {
    throw unexpectedStatus(`updating ${domain}:policy.${policyName}`, updated.status)
  }

  const verified = await requestZms("GET", policyPath)
  if (verified.status !== 200) {
    throw unexpectedStatus(`verifying ${domain}:policy.${policyName}`, verified.status)
  }
  const verifiedAssertions = parseZmsPolicy(verified.body)
  if (!verifiedAssertions.some((assertion) => policyAssertionKey(assertion) === expectedKey)) {
    throw new Error(`Unable to verify ${domain}:policy.${policyName}`)
  }
  return isSuccess(updated.status)
}

export function permissionPolicyName(role: string, action: string, resource: string) {
  const normalized = `${role}_${action}_${resource}`
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "policy"
  if (normalized.length <= MAX_POLICY_NAME_LENGTH) return normalized
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 12)
  return `${normalized.slice(0, MAX_POLICY_NAME_LENGTH - digest.length - 1)}_${digest}`
}

function roleContains(body: string, member: string) {
  const payload = parseRecord(body, "Athenz role")
  const roleMembers = Array.isArray(payload.roleMembers) ? payload.roleMembers : []
  const members = Array.isArray(payload.members) ? payload.members : []
  return roleMembers.some((value) => (
    isRecord(value) && value.memberName === member
  )) || members.includes(member)
}

function parseRecord(body: string, resource: string) {
  try {
    const value = JSON.parse(body) as unknown
    if (isRecord(value)) return value
  } catch {
    // Use the stable error below without exposing the ZMS response body.
  }
  throw new Error(`ZMS returned an invalid ${resource}`)
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
