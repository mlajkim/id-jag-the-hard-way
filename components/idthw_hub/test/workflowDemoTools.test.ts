import assert from "node:assert/strict"
import test from "node:test"
import type { ZmsRequest } from "../features/registration/api/mcpManagedAccess.ts"
import {
  grantWorkflowDemoRoles,
  resetWorkflowDemoRoles,
  WORKFLOW_DEMO_MEMBER,
  WORKFLOW_DEMO_ROLES,
} from "../features/workflow/api/workflowDemoTools.ts"

test("idempotently grants and resets the three fixed workflow demo roles", async () => {
  const zms = new FakeDemoZms()
  zms.members(WORKFLOW_DEMO_ROLES[0]).add(WORKFLOW_DEMO_MEMBER)

  assert.deepEqual(await grantWorkflowDemoRoles(zms.request), {
    member: WORKFLOW_DEMO_MEMBER,
    membershipsAdded: 2,
    roles: [...WORKFLOW_DEMO_ROLES],
  })
  for (const role of WORKFLOW_DEMO_ROLES) {
    assert.equal(zms.members(role).has(WORKFLOW_DEMO_MEMBER), true)
  }
  assert.equal((await grantWorkflowDemoRoles(zms.request)).membershipsAdded, 0)

  assert.deepEqual(await resetWorkflowDemoRoles(zms.request), {
    member: WORKFLOW_DEMO_MEMBER,
    membershipsRemoved: 3,
    roles: [...WORKFLOW_DEMO_ROLES],
  })
  for (const role of WORKFLOW_DEMO_ROLES) {
    assert.equal(zms.members(role).has(WORKFLOW_DEMO_MEMBER), false)
  }
  assert.equal((await resetWorkflowDemoRoles(zms.request)).membershipsRemoved, 0)
})

test("does not create a missing workflow demo role", async () => {
  const zms = new FakeDemoZms(WORKFLOW_DEMO_ROLES.slice(0, 2))
  await assert.rejects(grantWorkflowDemoRoles(zms.request), /docs-deleter does not exist/)
})

class FakeDemoZms {
  private readonly roles = new Map<string, Set<string>>()

  constructor(roles: readonly string[] = WORKFLOW_DEMO_ROLES) {
    for (const role of roles) this.roles.set(role, new Set())
  }

  members(role: string) {
    const members = this.roles.get(role)
    if (!members) throw new Error(`Missing fake role ${role}`)
    return members
  }

  request: ZmsRequest = async (method, requestPath) => {
    const memberMatch = /^\/domain\/([^/]+)\/role\/([^/]+)\/member\/([^/]+)$/.exec(requestPath)
    if (memberMatch) {
      const scopedRole = `${decodeURIComponent(memberMatch[1])}:role.${decodeURIComponent(memberMatch[2])}`
      const members = this.roles.get(scopedRole)
      if (!members) return response(404, {})
      const member = decodeURIComponent(memberMatch[3])
      if (method === "PUT") members.add(member)
      if (method === "DELETE") members.delete(member)
      return response(200, {})
    }

    const roleMatch = /^\/domain\/([^/]+)\/role\/([^/]+)$/.exec(requestPath)
    if (roleMatch && method === "GET") {
      const scopedRole = `${decodeURIComponent(roleMatch[1])}:role.${decodeURIComponent(roleMatch[2])}`
      const members = this.roles.get(scopedRole)
      return members
        ? response(200, { roleMembers: [...members].map((memberName) => ({ memberName })) })
        : response(404, {})
    }

    throw new Error(`Unexpected ZMS request: ${method} ${requestPath}`)
  }
}

function response(status: number, body: unknown) {
  return { status, body: JSON.stringify(body) }
}
