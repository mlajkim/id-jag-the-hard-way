import assert from "node:assert/strict"
import test from "node:test"
import {
  permissionPolicyName,
  requestToolPermissionAccess,
} from "../features/permissions/api/requestToolPermissionAccess.ts"
import type { PermissionReadinessGroup } from "../features/permissions/types/permissions.ts"
import type { ZmsRequest } from "../features/registration/api/mcpManagedAccess.ts"

test("grants only missing custom tool memberships and policies", async () => {
  const state = new FakeZms([
    "api:role.docs-getter",
    "api:role.docs-getter-jag-exchanger",
    "api:role.docs-getter-exchanger",
    "mcp-hub.mcps.idthw-demo:role.api-mcp-accessor",
  ])
  const group = permissionGroup()

  const first = await requestToolPermissionAccess(group, state.request)
  assert.deepEqual(first, {
    changed: true,
    membershipsAdded: 3,
    policiesUpdated: 2,
  })
  assert.deepEqual([...state.members("api:role.docs-getter")], ["human.demo-user"])
  assert.deepEqual(
    [...state.members("api:role.docs-getter-jag-exchanger")],
    ["mcp-hub.mcp-gateway"],
  )
  assert.deepEqual(
    [...state.members("api:role.docs-getter-exchanger")],
    ["mcp-hub.mcps.idthw-demo.idthw-api-mcp"],
  )
  assert.deepEqual(
    [...state.members("mcp-hub.mcps.idthw-demo:role.api-mcp-accessor")],
    [],
  )
  assert.equal(state.policies.size, 2)
  assert.equal(
    state.policies.has(permissionPolicyName(
      "docs-getter-jag-exchanger",
      "zts.jag_exchange",
      "api:role.docs-getter",
    )),
    true,
  )
  assert.equal(
    state.policies.has(permissionPolicyName(
      "docs-getter-exchanger",
      "zts.token_target_exchange",
      "api:mcp-hub.mcps.idthw-demo:role.docs-getter",
    )),
    true,
  )
  assert.equal(
    [...state.policies.values()].some(({ assertions }) => assertions.some(
      ({ action }) => action === "zts.token_source_exchange",
    )),
    false,
  )

  const second = await requestToolPermissionAccess(group, state.request)
  assert.deepEqual(second, {
    changed: false,
    membershipsAdded: 0,
    policiesUpdated: 0,
  })
})

test("does not create a missing downstream role", async () => {
  const state = new FakeZms([])
  await assert.rejects(
    requestToolPermissionAccess({
      ...permissionGroup(),
      policies: [],
      requirements: [permissionGroup().requirements[0]],
    }, state.request),
    /Required Athenz role api:role\.docs-getter does not exist/,
  )
  assert.equal(state.mutations.length, 0)
})

test("rejects a request while custom permission status is unavailable", async () => {
  const state = new FakeZms(["api:role.docs-getter"])
  const group = permissionGroup()
  group.requirements[0].status = "unavailable"
  await assert.rejects(
    requestToolPermissionAccess(group, state.request),
    /permission status is currently unavailable/,
  )
  assert.equal(state.mutations.length, 0)
})

function permissionGroup(): PermissionReadinessGroup {
  return {
    kind: "tool",
    label: "Tool: get_k8s_docs",
    toolName: "get_k8s_docs",
    requirements: [{
      configuredMember: "<signed_in_user>",
      label: "Direct tool access",
      member: "human.demo-user",
      role: "api:role.docs-getter",
      roleUrl: "http://localhost/role/docs-getter",
      source: "tool",
      status: "missing",
    }, {
      configuredMember: "mcp-hub.mcp-gateway",
      label: "Gateway helper",
      member: "mcp-hub.mcp-gateway",
      role: "api:role.docs-getter-jag-exchanger",
      roleUrl: "http://localhost/role/docs-getter-jag-exchanger",
      source: "helper",
      status: "missing",
    }, {
      configuredMember: "mcp-hub.mcps.idthw-demo.idthw-api-mcp",
      label: "MCP service helper",
      member: "mcp-hub.mcps.idthw-demo.idthw-api-mcp",
      role: "api:role.docs-getter-exchanger",
      roleUrl: "http://localhost/role/docs-getter-exchanger",
      source: "helper",
      status: "missing",
    }, {
      configuredMember: "<signed_in_user>",
      label: "Managed MCP access",
      member: "human.demo-user",
      role: "mcp-hub.mcps.idthw-demo:role.api-mcp-accessor",
      roleUrl: "http://localhost/role/api-mcp-accessor",
      source: "managed",
      status: "missing",
    }],
    policies: [{
      action: "zts.jag_exchange",
      effect: "ALLOW",
      label: "ID-JAG exchange policy",
      resource: "api:role.docs-getter",
      role: "api:role.docs-getter-jag-exchanger",
      roleUrl: "http://localhost/policy/docs-getter-jag-exchanger",
      source: "helper",
      status: "missing",
    }, {
      action: "zts.token_target_exchange",
      effect: "ALLOW",
      label: "Target-token exchange policy",
      resource: "api:mcp-hub.mcps.idthw-demo:role.docs-getter",
      role: "api:role.docs-getter-exchanger",
      roleUrl: "http://localhost/policy/docs-getter-exchanger",
      source: "helper",
      status: "missing",
    }, {
      action: "zts.token_source_exchange",
      effect: "ALLOW",
      label: "Managed source-token policy",
      resource: "mcp-hub.mcps.idthw-demo:api",
      role: "mcp-hub.mcps.idthw-demo:role.api-mcp-accessor-source-exchanger",
      roleUrl: "http://localhost/policy/api-mcp-accessor-source-exchanger",
      source: "managed",
      status: "missing",
    }],
  }
}

type StoredPolicy = {
  assertions: Array<{ action: string; effect: "ALLOW" | "DENY"; resource: string; role: string }>
  name: string
}

class FakeZms {
  mutations: Array<{ body?: unknown; method: string; path: string }> = []
  policies = new Map<string, StoredPolicy>()
  private roles = new Map<string, Set<string>>()

  constructor(roles: string[]) {
    for (const role of roles) this.roles.set(role, new Set())
  }

  members(role: string) {
    return this.roles.get(role) ?? new Set<string>()
  }

  request: ZmsRequest = async (method, requestPath, body) => {
    if (method !== "GET") this.mutations.push({ body, method, path: requestPath })

    const memberMatch = /^\/domain\/([^/]+)\/role\/([^/]+)\/member\/([^/]+)$/.exec(requestPath)
    if (memberMatch && method === "PUT") {
      const domain = decodeURIComponent(memberMatch[1])
      const role = decodeURIComponent(memberMatch[2])
      const member = decodeURIComponent(memberMatch[3])
      this.roles.get(`${domain}:role.${role}`)?.add(member)
      return response(200, {})
    }

    const roleMatch = /^\/domain\/([^/]+)\/role\/([^/]+)$/.exec(requestPath)
    if (roleMatch) {
      const domain = decodeURIComponent(roleMatch[1])
      const role = decodeURIComponent(roleMatch[2])
      const members = this.roles.get(`${domain}:role.${role}`)
      return members
        ? response(200, { roleMembers: [...members].map((memberName) => ({ memberName })) })
        : response(404, {})
    }

    const policyMatch = /^\/domain\/([^/]+)\/policy\/([^/]+)$/.exec(requestPath)
    if (policyMatch) {
      const policyName = decodeURIComponent(policyMatch[2])
      if (method === "PUT") {
        this.policies.set(policyName, body as StoredPolicy)
        return response(200, {})
      }
      const policy = this.policies.get(policyName)
      return policy ? response(200, policy) : response(404, {})
    }

    throw new Error(`Unexpected ZMS request: ${method} ${requestPath}`)
  }
}

function response(status: number, body: unknown) {
  return { status, body: JSON.stringify(body) }
}
