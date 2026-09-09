import assert from "node:assert/strict"
import test from "node:test"
import type { KubectlRunner } from "../features/kubernetes/api/kubectl.ts"
import {
  createWorkflowFormTemplate,
  deleteWorkflowFormTemplate,
  listWorkflowFormTemplates,
} from "../features/workflow/api/workflowFormTemplates.ts"
import {
  buildWorkflowFormTemplateConfigMap,
  newWorkflowFormTemplate,
  parseNewWorkflowFormTemplate,
} from "../features/workflow/lib/workflowFormTemplate.ts"
import type { NewWorkflowFormTemplate } from "../features/workflow/types.ts"

const INPUT: NewWorkflowFormTemplate = {
  applicationContent: "Explain why access is needed.",
  createdBy: "demo-user",
  fields: [{ label: "Business justification", options: [], required: true, type: "text" }],
  id: "provider-service-access",
  subject: "Provider service access",
}

test("builds a visible-ID ConfigMap and records the creator", () => {
  const template = newWorkflowFormTemplate(
    INPUT,
    "2026-09-09T12:34:56.000Z",
  )
  const configMap = buildWorkflowFormTemplateConfigMap(template)

  assert.equal(configMap.metadata.name, "workflow-form-template-provider-service-access")
  assert.equal(configMap.metadata.annotations["mcp.idthw.dev/created-by"], "demo-user")
  assert.deepEqual(template.fields, [{
    id: "field-1",
    label: "Business justification",
    options: [],
    required: true,
    type: "text",
  }])
  assert.deepEqual(JSON.parse(configMap.data["template.json"]), template)
})

test("validates the small workflow form schema", () => {
  assert.deepEqual(parseNewWorkflowFormTemplate({
    applicationContent: "Provide the request details.",
    fields: [{
      label: "Requested action",
      options: ["Create", "Update", "Delete"],
      required: true,
      type: "bullet-list",
    }],
    id: "access-request",
    subject: "Access request",
  }), {
    applicationContent: "Provide the request details.",
    fields: [{
      label: "Requested action",
      options: ["Create", "Update", "Delete"],
      required: true,
      type: "bullet-list",
    }],
    id: "access-request",
    subject: "Access request",
  })
  assert.throws(
    () => parseNewWorkflowFormTemplate({
      applicationContent: "Details",
      fields: [{ label: "", options: [], required: true, type: "text" }],
      id: "access",
      subject: "Access",
    }),
    /field 1 label is required/,
  )
  assert.throws(
    () => parseNewWorkflowFormTemplate({
      applicationContent: "Details",
      fields: [{ label: "Requested action", options: [], required: true, type: "bullet-list" }],
      id: "access",
      subject: "Access",
    }),
    /requires at least one option/,
  )
  assert.throws(
    () => parseNewWorkflowFormTemplate({ applicationContent: "Details", fields: [], id: "access", subject: "" }),
    /subject is required/,
  )
  assert.throws(
    () => parseNewWorkflowFormTemplate({
      applicationContent: "Details",
      fields: [],
      id: "Invalid ID",
      subject: "Access",
    }),
    /ID must use lowercase letters/,
  )
})

test("creates, lists, and deletes workflow form template ConfigMaps", async () => {
  const cluster = new FakeWorkflowTemplateCluster()
  const created = await createWorkflowFormTemplate(INPUT, cluster.run)
  assert.equal(created.createdBy, "demo-user")
  assert.equal(created.id, "provider-service-access")

  const templates = await listWorkflowFormTemplates(cluster.run)
  assert.equal(templates.length, 1)
  assert.equal(templates[0].id, created.id)
  assert.equal(templates[0].subject, "Provider service access")

  await deleteWorkflowFormTemplate(created.id, cluster.run)
  assert.deepEqual(await listWorkflowFormTemplates(cluster.run), [])
})

type StoredConfigMap = {
  data: Record<string, string>
  metadata: { name: string }
}

class FakeWorkflowTemplateCluster {
  private readonly configMaps = new Map<string, StoredConfigMap>()

  readonly run: KubectlRunner = async (args, stdin) => {
    const command = args.find((arg) => ["create", "delete", "get"].includes(arg))
    const dryRun = args.includes("--dry-run=server")

    if (command === "create") {
      const configMap = JSON.parse(stdin ?? "") as StoredConfigMap
      if (!dryRun) this.configMaps.set(configMap.metadata.name, configMap)
      return { stdout: "", stderr: "" }
    }

    if (command === "get" && args.includes("configmaps")) {
      return {
        stdout: JSON.stringify({ items: [...this.configMaps.values()] }),
        stderr: "",
      }
    }

    const resource = args.find((arg) => arg.startsWith("configmap/"))
    const name = resource?.slice("configmap/".length) ?? ""
    if (command === "get") {
      return {
        stdout: this.configMaps.has(name) ? `${resource}\n` : "",
        stderr: "",
      }
    }
    if (command === "delete") {
      if (!dryRun) this.configMaps.delete(name)
      return { stdout: "", stderr: "" }
    }

    throw new Error(`Unexpected kubectl arguments: ${args.join(" ")}`)
  }
}
