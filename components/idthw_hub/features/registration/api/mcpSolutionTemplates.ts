import {
  parseAthenzRole,
  SIGNED_IN_USER_MEMBER,
} from "../../permissions/lib/permissionPreset.ts"
import type { ToolPermissionSettings } from "../../permissions/types/permissions.ts"
import { managedMcpAccessDomain } from "../lib/kubernetesManifest.ts"
import {
  serviceNameInDomain,
  type ZmsRequest,
} from "./mcpManagedAccess.ts"

export const MCP_HUB_MANAGED_ACCESS_TEMPLATE = "mcp_hub_managed_access"
export const MCP_EXCHANGE_HELPERS_TEMPLATE = "mcp_exchange_helpers"

const DNS_LABEL_PATTERN = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/
const ATHENZ_DOMAIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export type McpExchangeHelperTarget = {
  domain: string
  role: string
}

export function mcpExchangeHelperTargets(
  settings: ToolPermissionSettings | undefined,
): McpExchangeHelperTarget[] {
  if (!settings) return []
  const targets = Object.values(settings.tools)
    .flatMap(({ requirements }) => requirements)
    .filter(({ includeExchangeHelpers, member }) => (
      includeExchangeHelpers === true && member === SIGNED_IN_USER_MEMBER
    ))
    .map(({ role }) => parseAthenzRole(role))
  const unique = new Map(targets.map((target) => [`${target.domain}\n${target.role}`, target]))
  return [...unique.values()].sort((left, right) => (
    left.domain.localeCompare(right.domain) || left.role.localeCompare(right.role)
  ))
}

export async function applyMcpHubManagedAccessSolutionTemplate(
  project: string,
  mcpKeyName: string,
  serviceAccount: string,
  requestZms: ZmsRequest,
) {
  if (!DNS_LABEL_PATTERN.test(project) || !DNS_LABEL_PATTERN.test(mcpKeyName)) {
    throw new Error("Managed MCP solution-template parameters are invalid")
  }
  const domain = managedMcpAccessDomain(project)
  const service = serviceNameInDomain(serviceAccount, domain)
  await requireResource(
    requestZms,
    `/domain/${encodeURIComponent(domain)}`,
    `Athenz domain ${domain} does not exist`,
  )
  await requireResource(
    requestZms,
    `/domain/${encodeURIComponent(domain)}/service/${encodeURIComponent(service)}`,
    `Athenz service account ${serviceAccount} does not exist`,
  )
  await applyDomainSolutionTemplate(requestZms, domain, MCP_HUB_MANAGED_ACCESS_TEMPLATE, [
    { name: "mcp_key", value: mcpKeyName },
    { name: "source_service", value: service },
  ])
}

export async function applyMcpExchangeHelperSolutionTemplates(
  settings: ToolPermissionSettings | undefined,
  sourceDomain: string,
  sourceServiceAccount: string,
  requestZms: ZmsRequest,
) {
  if (!ATHENZ_DOMAIN_PATTERN.test(sourceDomain)) {
    throw new Error("MCP exchange-helper source domain is invalid")
  }
  const sourceService = serviceNameInDomain(sourceServiceAccount, sourceDomain)
  const sourcePrincipal = `${sourceDomain}.${sourceService}`
  const targets = mcpExchangeHelperTargets(settings)
  for (const target of targets) {
    await requireResource(
      requestZms,
      `/domain/${encodeURIComponent(target.domain)}/role/${encodeURIComponent(target.role)}`,
      `Required Athenz role ${target.domain}:role.${target.role} does not exist`,
    )
    await applyDomainSolutionTemplate(requestZms, target.domain, MCP_EXCHANGE_HELPERS_TEMPLATE, [
      { name: "target_role", value: target.role },
      { name: "source_audience", value: sourceDomain },
      { name: "source_principal", value: sourcePrincipal },
    ])
    await verifyMcpExchangeHelpers(requestZms, target, sourceDomain, sourcePrincipal)
  }
  return { templatesApplied: targets.length, targets }
}

async function applyDomainSolutionTemplate(
  requestZms: ZmsRequest,
  domain: string,
  templateName: string,
  params: Array<{ name: string; value: string }>,
) {
  const response = await requestZms("PUT", `/domain/${encodeURIComponent(domain)}/template`, {
    params,
    templateNames: [templateName],
  })
  if (!isSuccess(response.status)) {
    throw new Error(
      `ZMS returned HTTP ${response.status || "unknown"} while applying ${templateName} to ${domain}`,
    )
  }
}

async function verifyMcpExchangeHelpers(
  requestZms: ZmsRequest,
  target: McpExchangeHelperTarget,
  sourceDomain: string,
  sourcePrincipal: string,
) {
  const targetRole = `${target.domain}:role.${target.role}`
  const expectations = [{
    member: sourcePrincipal,
    role: `${target.role}-exchanger`,
  }, {
    member: "mcp-hub.mcp-gateway",
    role: `${target.role}-jag-exchanger`,
  }]
  for (const expectation of expectations) {
    const response = await requestZms(
      "GET",
      `/domain/${encodeURIComponent(target.domain)}/role/${encodeURIComponent(expectation.role)}`,
    )
    if (response.status !== 200 || !roleContains(response.body, expectation.member)) {
      throw new Error(`Unable to verify ${target.domain}:role.${expectation.role}`)
    }
  }

  const policies = [{
    action: "zts.token_target_exchange",
    name: `${target.role}-exchanger`,
    resource: `${target.domain}:${sourceDomain}:role.${target.role}`,
    role: `${target.domain}:role.${target.role}-exchanger`,
  }, {
    action: "zts.jag_exchange",
    name: `${target.role}-jag-exchanger`,
    resource: targetRole,
    role: `${target.domain}:role.${target.role}-jag-exchanger`,
  }]
  for (const policy of policies) {
    const response = await requestZms(
      "GET",
      `/domain/${encodeURIComponent(target.domain)}/policy/${encodeURIComponent(policy.name)}`,
    )
    if (response.status !== 200 || !policyContains(response.body, policy)) {
      throw new Error(`Unable to verify ${target.domain}:policy.${policy.name}`)
    }
  }
}

async function requireResource(
  requestZms: ZmsRequest,
  path: string,
  missingMessage: string,
) {
  const response = await requestZms("GET", path)
  if (response.status === 200) return
  if (response.status === 404) throw new Error(missingMessage)
  throw new Error(`ZMS returned HTTP ${response.status || "unknown"} while checking solution-template prerequisites`)
}

function roleContains(body: string, member: string) {
  const role = parseRecord(body, "Athenz role")
  const roleMembers = Array.isArray(role.roleMembers) ? role.roleMembers : []
  const members = Array.isArray(role.members) ? role.members : []
  return roleMembers.some((value) => isRecord(value) && value.memberName === member)
    || members.includes(member)
}

function policyContains(
  body: string,
  expected: { action: string; resource: string; role: string },
) {
  const policy = parseRecord(body, "Athenz policy")
  const assertions = Array.isArray(policy.assertions) ? policy.assertions : []
  return assertions.some((value) => isRecord(value)
    && value.action === expected.action
    && value.resource === expected.resource
    && value.role === expected.role)
}

function parseRecord(body: string, resource: string): Record<string, unknown> {
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
