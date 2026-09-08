import assert from "node:assert/strict"
import test from "node:test"
import type { KubectlRunner } from "../features/kubernetes/api/kubectl.ts"
import { listProjectNamespaces } from "../features/projects/api/projectNamespaces.ts"
import { isProjectNamespaceName } from "../features/projects/lib/projectNamespace.ts"

test("excludes reserved namespaces from project names", () => {
  assert.equal(isProjectNamespaceName("idthw-demo"), true)
  assert.equal(isProjectNamespaceName("api"), true)
  assert.equal(isProjectNamespaceName("agent-gateway"), false)
  assert.equal(isProjectNamespaceName("ai"), false)
  assert.equal(isProjectNamespaceName("athenz"), false)
  assert.equal(isProjectNamespaceName("default"), false)
  assert.equal(isProjectNamespaceName("human"), false)
  assert.equal(isProjectNamespaceName("idp"), false)
  assert.equal(isProjectNamespaceName("kube-system"), false)
  assert.equal(isProjectNamespaceName("kube-company-internal"), false)
  assert.equal(isProjectNamespaceName("local-path-storage"), false)
  assert.equal(isProjectNamespaceName("mcp-hub"), false)
  assert.equal(isProjectNamespaceName("Invalid_Name"), false)
})

test("lists allowed Kubernetes namespaces as sorted projects", async () => {
  const runKubectl: KubectlRunner = async (args) => {
    assert.deepEqual(args.slice(-4), ["get", "namespaces", "-o", "json"])
    return {
      stderr: "",
      stdout: JSON.stringify({
        items: [
          namespace("kube-system", "Active", "2026-01-01T00:00:00Z"),
          namespace("project-z", "Terminating", "2026-09-08T00:00:00Z"),
          namespace("idthw-demo", "Active", "2026-09-07T00:00:00Z"),
          namespace("default", "Active", "2026-01-01T00:00:00Z"),
        ],
      }),
    }
  }

  assert.deepEqual(await listProjectNamespaces(runKubectl), [
    { createdAt: "2026-09-07T00:00:00Z", name: "idthw-demo", status: "Active" },
    { createdAt: "2026-09-08T00:00:00Z", name: "project-z", status: "Terminating" },
  ])
})

function namespace(name: string, phase: string, creationTimestamp: string) {
  return {
    metadata: { creationTimestamp, name },
    status: { phase },
  }
}
