import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  kubectlArgs,
  runKubectlCommand,
  type KubectlRunner,
} from "../../kubernetes/api/kubectl.ts"
import {
  applicationAnswersFromPayload,
  approvedWorkflowApplication,
  buildWorkflowApplicationConfigMap,
  newWorkflowApplication,
  parseWorkflowApplication,
  WORKFLOW_APPLICATION_PREFIX,
  WORKFLOW_APPLICATION_RESOURCE,
} from "../lib/workflowApplication.ts"
import type {
  WorkflowApplication,
  WorkflowApplicationStatus,
  WorkflowFormTemplate,
} from "../types.ts"

const WORKFLOW_NAMESPACE = "mcp-hub"
const APPLICATION_DATA_KEY = "application.json"
const RESOURCE_SELECTOR = `mcp.idthw.dev/resource=${WORKFLOW_APPLICATION_RESOURCE}`
const APPLICATION_ID_PATTERN = /^\d{14}-[a-f0-9]{8}$/

type StoredConfigMap = {
  data?: Record<string, string>
  metadata?: { name?: string }
}

type ConfigMapList = {
  items?: StoredConfigMap[]
}

export class WorkflowApplicationNotFoundError extends Error {}

export async function createWorkflowApplication(
  template: WorkflowFormTemplate,
  payload: unknown,
  createdBy: string,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  const now = new Date()
  const timestamp = now.toISOString().replace(/\D/g, "").slice(0, 14)
  const id = `${timestamp}-${randomUUID().replace(/-/g, "").slice(0, 8)}`
  const application = newWorkflowApplication({
    answers: applicationAnswersFromPayload(template, payload),
    createdAt: now.toISOString(),
    createdBy,
    id,
    template,
  })
  const manifest = JSON.stringify(buildWorkflowApplicationConfigMap(application))
  await runKubectl(kubectlArgs(["create", "--dry-run=server", "-f", "-"]), manifest)
  await runKubectl(kubectlArgs(["create", "-f", "-"]), manifest)
  return application
}

export async function listWorkflowApplications(
  filters: {
    createdBy?: string
    status?: WorkflowApplicationStatus
    templateId?: string
  } = {},
  runKubectl: KubectlRunner = runKubectlCommand,
): Promise<WorkflowApplication[]> {
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
  const applications = (payload.items ?? []).map(applicationFromConfigMap)
    .filter((application) => !filters.createdBy || application.createdBy === filters.createdBy)
    .filter((application) => !filters.status || application.status === filters.status)
    .filter((application) => !filters.templateId || application.templateId === filters.templateId)
  return applications.sort((left, right) => {
    if (left.status !== right.status) return left.status === "pending" ? -1 : 1
    return right.createdAt.localeCompare(left.createdAt)
  })
}

export async function getWorkflowApplication(
  applicationId: string,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  assertApplicationId(applicationId)
  const result = await runKubectl(kubectlArgs([
    "get",
    `configmap/${WORKFLOW_APPLICATION_PREFIX}${applicationId}`,
    "--namespace",
    WORKFLOW_NAMESPACE,
    "--ignore-not-found",
    "-o",
    "json",
  ]))
  if (!result.stdout.trim()) throw new WorkflowApplicationNotFoundError("Workflow application not found")
  return applicationFromConfigMap(JSON.parse(result.stdout) as StoredConfigMap)
}

export async function markWorkflowApplicationApproved(
  application: WorkflowApplication,
  approvedBy: string,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  if (application.status === "approved") return application
  const approved = approvedWorkflowApplication(application, new Date().toISOString(), approvedBy)
  const patchDirectory = await mkdtemp(join(tmpdir(), "idthw-workflow-application-patch-"))
  const patchPath = join(patchDirectory, "patch.json")
  try {
    await writeFile(patchPath, JSON.stringify({
      data: { [APPLICATION_DATA_KEY]: JSON.stringify(approved) },
      metadata: { labels: { "mcp.idthw.dev/status": "approved" } },
    }), { encoding: "utf8", mode: 0o600 })
    const args = [
      "patch",
      `configmap/${WORKFLOW_APPLICATION_PREFIX}${application.id}`,
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
  return approved
}

export async function deleteApprovedWorkflowApplications(
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  const approved = await listWorkflowApplications({ status: "approved" }, runKubectl)
  if (approved.length === 0) return { deleted: 0 }
  const resources = approved.map(({ id }) => `configmap/${WORKFLOW_APPLICATION_PREFIX}${id}`)
  const args = [
    "delete",
    ...resources,
    "--namespace",
    WORKFLOW_NAMESPACE,
    "--wait=true",
  ]
  await runKubectl(kubectlArgs([...args, "--dry-run=server"]))
  await runKubectl(kubectlArgs(args))
  return { deleted: approved.length }
}

function applicationFromConfigMap(configMap: StoredConfigMap) {
  const name = configMap.metadata?.name ?? ""
  if (!name.startsWith(WORKFLOW_APPLICATION_PREFIX)) {
    throw new Error("Workflow application ConfigMap name is invalid")
  }
  const rawApplication = configMap.data?.[APPLICATION_DATA_KEY]
  if (!rawApplication) {
    throw new Error(`Workflow application ConfigMap ${name} is missing ${APPLICATION_DATA_KEY}`)
  }
  const application = parseWorkflowApplication(JSON.parse(rawApplication) as unknown)
  if (name !== `${WORKFLOW_APPLICATION_PREFIX}${application.id}`) {
    throw new Error(`Workflow application ConfigMap ${name} does not match its application id`)
  }
  return application
}

function assertApplicationId(applicationId: string) {
  if (!APPLICATION_ID_PATTERN.test(applicationId)) {
    throw new WorkflowApplicationNotFoundError("Workflow application not found")
  }
}
