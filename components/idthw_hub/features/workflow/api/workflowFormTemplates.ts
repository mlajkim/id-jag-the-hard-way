import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  isKubectlAlreadyExists,
  kubectlArgs,
  runKubectlCommand,
  type KubectlRunner,
} from "../../kubernetes/api/kubectl.ts"
import {
  buildWorkflowFormTemplateConfigMap,
  isWorkflowFormTemplateId,
  newWorkflowFormTemplate,
  parseWorkflowFormTemplate,
  updatedWorkflowFormTemplate,
  WORKFLOW_FORM_TEMPLATE_PREFIX,
  WORKFLOW_FORM_TEMPLATE_RESOURCE,
} from "../lib/workflowFormTemplate.ts"
import type {
  NewWorkflowFormTemplate,
  WorkflowFormTemplate,
  WorkflowFormTemplateUpdate,
} from "../types.ts"

const WORKFLOW_NAMESPACE = "mcp-hub"
const TEMPLATE_DATA_KEY = "template.json"
const RESOURCE_SELECTOR = `mcp.idthw.dev/resource=${WORKFLOW_FORM_TEMPLATE_RESOURCE}`

type StoredConfigMap = {
  data?: Record<string, string>
  metadata?: { name?: string }
}

type ConfigMapList = {
  items?: StoredConfigMap[]
}

export class WorkflowFormTemplateNotFoundError extends Error {}
export class WorkflowFormTemplateConflictError extends Error {}
export class WorkflowFormTemplateVersionConflictError extends Error {}

export async function createWorkflowFormTemplate(
  input: NewWorkflowFormTemplate,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  const now = new Date()
  const template = newWorkflowFormTemplate(input, now.toISOString())
  const manifest = JSON.stringify(buildWorkflowFormTemplateConfigMap(template))
  try {
    await runKubectl(kubectlArgs(["create", "--dry-run=server", "-f", "-"]), manifest)
    await runKubectl(kubectlArgs(["create", "-f", "-"]), manifest)
  } catch (error) {
    if (isKubectlAlreadyExists(error)) {
      throw new WorkflowFormTemplateConflictError(`Workflow form template ${input.id} already exists`)
    }
    throw error
  }
  return template
}

export async function listWorkflowFormTemplates(
  runKubectl: KubectlRunner = runKubectlCommand,
): Promise<WorkflowFormTemplate[]> {
  const result = await runKubectl(kubectlArgs([
    "get",
    "configmaps",
    "--namespace",
    WORKFLOW_NAMESPACE,
    "--selector",
    RESOURCE_SELECTOR,
    "-o",
    "json",
  ]))
  const payload = JSON.parse(result.stdout) as ConfigMapList
  return (payload.items ?? [])
    .map(templateFromConfigMap)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function getWorkflowFormTemplate(
  templateId: string,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  assertTemplateId(templateId)
  const result = await runKubectl(kubectlArgs([
    "get",
    `configmap/${WORKFLOW_FORM_TEMPLATE_PREFIX}${templateId}`,
    "--namespace",
    WORKFLOW_NAMESPACE,
    "--ignore-not-found",
    "-o",
    "json",
  ]))
  if (!result.stdout.trim()) throw new WorkflowFormTemplateNotFoundError("Workflow form template not found")
  return templateFromConfigMap(JSON.parse(result.stdout) as StoredConfigMap)
}

export async function updateWorkflowFormTemplate(
  templateId: string,
  input: WorkflowFormTemplateUpdate,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  const current = await getWorkflowFormTemplate(templateId, runKubectl)
  if (current.version !== input.version) {
    throw new WorkflowFormTemplateVersionConflictError(
      `Workflow form template ${templateId} is now version ${current.version}; reload before updating`,
    )
  }
  const updated = updatedWorkflowFormTemplate(current, input)
  const patchDirectory = await mkdtemp(join(tmpdir(), "idthw-workflow-template-patch-"))
  const patchPath = join(patchDirectory, "patch.json")
  try {
    await writeFile(patchPath, JSON.stringify({
      data: { [TEMPLATE_DATA_KEY]: JSON.stringify(updated) },
      metadata: { annotations: { "mcp.idthw.dev/version": String(updated.version) } },
    }), { encoding: "utf8", mode: 0o600 })
    const args = [
      "patch",
      `configmap/${WORKFLOW_FORM_TEMPLATE_PREFIX}${templateId}`,
      "--namespace",
      WORKFLOW_NAMESPACE,
      "--type=merge",
      "--patch-file",
      patchPath,
    ]
    await runKubectl(kubectlArgs([...args, "--dry-run=server"]))
    await runKubectl(kubectlArgs(args))
  } finally {
    await rm(patchDirectory, { recursive: true, force: true })
  }
  return updated
}

export async function deleteWorkflowFormTemplate(
  templateId: string,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  await getWorkflowFormTemplate(templateId, runKubectl)
  const resource = `configmap/${WORKFLOW_FORM_TEMPLATE_PREFIX}${templateId}`
  const args = ["delete", resource, "--namespace", WORKFLOW_NAMESPACE, "--wait=true"]
  await runKubectl(kubectlArgs([...args, "--dry-run=server"]))
  await runKubectl(kubectlArgs(args))
}

function templateFromConfigMap(configMap: StoredConfigMap) {
  const name = configMap.metadata?.name ?? ""
  if (!name.startsWith(WORKFLOW_FORM_TEMPLATE_PREFIX)) {
    throw new Error("Workflow form template ConfigMap name is invalid")
  }
  const rawTemplate = configMap.data?.[TEMPLATE_DATA_KEY]
  if (!rawTemplate) throw new Error(`Workflow form template ConfigMap ${name} is missing ${TEMPLATE_DATA_KEY}`)
  const template = parseWorkflowFormTemplate(JSON.parse(rawTemplate) as unknown)
  if (name !== `${WORKFLOW_FORM_TEMPLATE_PREFIX}${template.id}`) {
    throw new Error(`Workflow form template ConfigMap ${name} does not match its template id`)
  }
  return template
}

function assertTemplateId(templateId: string) {
  if (!isWorkflowFormTemplateId(templateId)) {
    throw new WorkflowFormTemplateNotFoundError("Workflow form template not found")
  }
}
