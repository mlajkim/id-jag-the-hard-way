import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import type { KubectlRunner } from "../features/kubernetes/api/kubectl.ts"
import {
  createPermissionWorkflowRequest,
  deleteApprovedPermissionWorkflowRequests,
  getPermissionWorkflowRequest,
  listPermissionWorkflowRequests,
  markPermissionWorkflowRequestApproved,
} from "../features/workflow/api/permissionWorkflowRequests.ts"
import {
  buildPermissionWorkflowConfigMap,
  newPermissionWorkflowRequest,
  parsePermissionWorkflowRequest,
} from "../features/workflow/lib/permissionWorkflowRequest.ts"
import type { NewPermissionWorkflowRequest } from "../features/workflow/types.ts"

const INPUT: NewPermissionWorkflowRequest = {
  mcpKeyName: "api-mcp",
  policies: [{
    action: "zts.jag_exchange",
    effect: "ALLOW",
    label: "ID-JAG exchange policy",
    resource: "api:role.docs-getter",
    role: "api:role.docs-getter-jag-exchanger",
    source: "helper",
  }],
  project: "idthw-demo",
  requesterPrincipal: "human.demo-user",
  requesterUsername: "demo-user",
  requirements: [{
    label: "Direct tool access",
    member: "human.demo-user",
    role: "api:role.docs-getter",
    source: "tool",
  }],
  serverDisplayName: "API MCP",
  toolName: "get_k8s_docs",
}

test("builds a prefixed ConfigMap containing a pending permission request", () => {
  const request = newPermissionWorkflowRequest(
    INPUT,
    "20260908123456-abcdef12",
    "2026-09-08T12:34:56.000Z",
  )
  const configMap = buildPermissionWorkflowConfigMap(request)

  assert.equal(configMap.metadata.name, "mcp-permission-request-20260908123456-abcdef12")
  assert.equal(configMap.metadata.namespace, "mcp-hub")
  assert.equal(configMap.metadata.labels["mcp.idthw.dev/status"], "pending")
  assert.deepEqual(JSON.parse(configMap.data["request.json"]), request)
})

test("rejects managed Step 1 permissions in a stored tool request", () => {
  const request = newPermissionWorkflowRequest(
    INPUT,
    "20260908123456-abcdef12",
    "2026-09-08T12:34:56.000Z",
  )
  assert.throws(
    () => parsePermissionWorkflowRequest({
      ...request,
      requirements: [{
        ...request.requirements[0],
        source: "managed",
      }],
    }),
    /requirement source is invalid/,
  )
})

test("uses request.json instead of labels as the workflow source of truth", async () => {
  const cluster = new FakeWorkflowCluster()
  const request = newPermissionWorkflowRequest(
    INPUT,
    "20260908123456-abcdef12",
    "2026-09-08T12:34:56.000Z",
  )
  const configMap = buildPermissionWorkflowConfigMap(request)
  configMap.metadata.labels["mcp.idthw.dev/status"] = "approved"
  cluster.store(configMap)

  assert.equal((await listPermissionWorkflowRequests({ status: "pending" }, cluster.run)).length, 1)
  assert.equal((await listPermissionWorkflowRequests({ status: "approved" }, cluster.run)).length, 0)
})

test("persists, deduplicates, lists, and approves permission requests", async () => {
  const cluster = new FakeWorkflowCluster()
  const first = await createPermissionWorkflowRequest(INPUT, cluster.run)
  assert.equal(first.created, true)
  assert.equal(first.request.status, "pending")

  const duplicate = await createPermissionWorkflowRequest(INPUT, cluster.run)
  assert.equal(duplicate.created, false)
  assert.equal(duplicate.request.id, first.request.id)
  assert.equal((await listPermissionWorkflowRequests({ status: "pending" }, cluster.run)).length, 1)
  assert.equal((await getPermissionWorkflowRequest(first.request.id, cluster.run)).toolName, "get_k8s_docs")

  const approved = await markPermissionWorkflowRequestApproved(first.request, {
    changed: true,
    membershipsAdded: 1,
    policiesUpdated: 1,
  }, cluster.run)
  assert.equal(approved.status, "approved")
  assert.deepEqual(approved.approvalReport, {
    changed: true,
    membershipsAdded: 1,
    policiesUpdated: 1,
  })
  assert.equal((await getPermissionWorkflowRequest(first.request.id, cluster.run)).status, "approved")
  assert.deepEqual(await deleteApprovedPermissionWorkflowRequests(cluster.run), { deleted: 1 })
  assert.equal((await listPermissionWorkflowRequests({}, cluster.run)).length, 0)
})

type StoredConfigMap = {
  data: Record<string, string>
  metadata: {
    labels: Record<string, string>
    name: string
    namespace: string
  }
}

class FakeWorkflowCluster {
  private configMaps = new Map<string, StoredConfigMap>()

  store(configMap: StoredConfigMap) {
    this.configMaps.set(configMap.metadata.name, configMap)
  }

  run: KubectlRunner = async (args, stdin) => {
    const operation = args.find((argument) => ["create", "delete", "get", "patch"].includes(argument))
    if (operation === "get" && args.includes("configmaps")) {
      return response({ items: [...this.configMaps.values()] })
    }
    if (operation === "get") {
      const resource = args.find((argument) => argument.startsWith("configmap/")) ?? ""
      const name = resource.slice("configmap/".length)
      const configMap = this.configMaps.get(name)
      return { stdout: configMap ? JSON.stringify(configMap) : "", stderr: "" }
    }
    if (operation === "create") {
      if (args.includes("--dry-run=server")) return response({})
      const configMap = JSON.parse(stdin ?? "") as StoredConfigMap
      this.configMaps.set(configMap.metadata.name, configMap)
      return response(configMap)
    }
    if (operation === "patch") {
      if (args.includes("--dry-run=server")) return response({})
      const resource = args.find((argument) => argument.startsWith("configmap/")) ?? ""
      const name = resource.slice("configmap/".length)
      const patchPath = args[args.indexOf("--patch-file") + 1]
      const patch = JSON.parse(await readFile(patchPath, "utf8")) as {
        data: Record<string, string>
        metadata: { labels: Record<string, string> }
      }
      const current = this.configMaps.get(name)
      if (!current) throw new Error(`Missing ConfigMap ${name}`)
      current.data = { ...current.data, ...patch.data }
      current.metadata.labels = { ...current.metadata.labels, ...patch.metadata.labels }
      return response(current)
    }
    if (operation === "delete") {
      if (args.includes("--dry-run=server")) return response({})
      for (const resource of args.filter((argument) => argument.startsWith("configmap/"))) {
        this.configMaps.delete(resource.slice("configmap/".length))
      }
      return response({})
    }
    throw new Error(`Unexpected kubectl command: ${args.join(" ")}`)
  }
}

function response(body: unknown) {
  return { stdout: JSON.stringify(body), stderr: "" }
}
