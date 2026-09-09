import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import type { KubectlRunner } from "../features/kubernetes/api/kubectl.ts"
import {
  createWorkflowApplication,
  deleteApprovedWorkflowApplications,
  getWorkflowApplication,
  listWorkflowApplications,
  markWorkflowApplicationApproved,
} from "../features/workflow/api/workflowApplications.ts"
import {
  applicationAnswersFromPayload,
  buildWorkflowApplicationConfigMap,
  parseWorkflowApplication,
} from "../features/workflow/lib/workflowApplication.ts"
import type { WorkflowFormTemplate } from "../features/workflow/types.ts"

const TEMPLATE: WorkflowFormTemplate = {
  applicationContent: "Provide the requested change.",
  createdAt: "2026-09-09T12:34:56.000Z",
  createdBy: "template-owner",
  fields: [{
    id: "field-1",
    label: "Requested action",
    options: ["Create", "Update", "Delete"],
    required: true,
    type: "bullet-list",
  }, {
    id: "field-2",
    label: "Reason",
    options: [],
    required: false,
    type: "text",
  }],
  id: "idthw-api-mcp-tools",
  operatorProcedureUrl: "https://docs.example.com/operator-procedure",
  subject: "Create, update, or delete MCP tools",
  version: 3,
}

test("validates registration answers against the referenced template", () => {
  assert.deepEqual(applicationAnswersFromPayload(TEMPLATE, {
    answers: { "field-1": "Update", "field-2": "Align the tool contract" },
    templateVersion: 3,
  }), [{
    fieldId: "field-1",
    label: "Requested action",
    value: "Update",
  }, {
    fieldId: "field-2",
    label: "Reason",
    value: "Align the tool contract",
  }])
  assert.throws(
    () => applicationAnswersFromPayload(TEMPLATE, { answers: { "field-1": "" } }),
    /Requested action is required/,
  )
  assert.throws(
    () => applicationAnswersFromPayload(TEMPLATE, { answers: { "field-1": "Rename" } }),
    /answer for Requested action is invalid/,
  )
  assert.throws(
    () => applicationAnswersFromPayload(TEMPLATE, {
      answers: { "field-1": "Update" },
      templateVersion: 2,
    }),
    /now version 3/,
  )
})

test("stores, lists, and status-only approves a submitted workflow application", async () => {
  const cluster = new FakeWorkflowApplicationCluster()
  const application = await createWorkflowApplication(
    TEMPLATE,
    { answers: { "field-1": "Create", "field-2": "New provider API" } },
    "applicant-user",
    cluster.run,
  )
  const configMap = buildWorkflowApplicationConfigMap(application)

  assert.match(application.id, /^\d{14}-[a-f0-9]{8}$/)
  assert.equal(application.status, "pending")
  assert.equal(application.templateId, "idthw-api-mcp-tools")
  assert.equal(application.templateVersion, 3)
  assert.equal(application.operatorProcedureUrl, "https://docs.example.com/operator-procedure")
  assert.equal(configMap.metadata.annotations["mcp.idthw.dev/created-by"], "applicant-user")
  assert.equal(configMap.metadata.labels["mcp.idthw.dev/status"], "pending")
  assert.equal(configMap.metadata.labels["mcp.idthw.dev/workflow-template-version"], "3")
  assert.equal((await listWorkflowApplications({ status: "pending" }, cluster.run)).length, 1)
  assert.equal((await getWorkflowApplication(application.id, cluster.run)).subject, TEMPLATE.subject)

  const approved = await markWorkflowApplicationApproved(application, "approval-owner", cluster.run)
  assert.equal(approved.status, "approved")
  assert.equal(approved.approvedBy, "approval-owner")
  assert.ok(approved.approvedAt)
  assert.equal((await listWorkflowApplications({ status: "pending" }, cluster.run)).length, 0)
  assert.equal((await listWorkflowApplications({ status: "approved" }, cluster.run)).length, 1)
  assert.equal((await getWorkflowApplication(application.id, cluster.run)).approvedBy, "approval-owner")
  assert.deepEqual(await deleteApprovedWorkflowApplications(cluster.run), { deleted: 1 })
  assert.equal((await listWorkflowApplications({}, cluster.run)).length, 0)
})

test("loads applications stored before workflow status was introduced as pending", () => {
  const legacyApplication = {
    answers: [],
    createdAt: "2026-09-09T12:34:56.000Z",
    createdBy: "applicant-user",
    id: "20260909123456-1234abcd",
    subject: "Legacy application",
    templateId: "legacy-template",
    version: 1,
  }
  const parsed = parseWorkflowApplication(legacyApplication)
  assert.equal(parsed.status, "pending")
  assert.equal(parsed.templateVersion, 1)
})

type StoredConfigMap = {
  data: Record<string, string>
  metadata: {
    annotations?: Record<string, string>
    labels: Record<string, string>
    name: string
  }
}

class FakeWorkflowApplicationCluster {
  private readonly configMaps = new Map<string, StoredConfigMap>()

  readonly run: KubectlRunner = async (args, stdin) => {
    const operation = args.find((argument) => ["create", "delete", "get", "patch"].includes(argument))
    if (operation === "get" && args.includes("configmaps")) {
      return response({ items: [...this.configMaps.values()] })
    }
    if (operation === "get") {
      const resource = args.find((argument) => argument.startsWith("configmap/")) ?? ""
      const configMap = this.configMaps.get(resource.slice("configmap/".length))
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
