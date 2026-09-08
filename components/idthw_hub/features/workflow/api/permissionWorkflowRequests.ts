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
  approvedPermissionWorkflowRequest,
  buildPermissionWorkflowConfigMap,
  newPermissionWorkflowRequest,
  parsePermissionWorkflowRequest,
  PERMISSION_REQUEST_PREFIX,
  PERMISSION_REQUEST_RESOURCE,
} from "../lib/permissionWorkflowRequest.ts"
import type {
  NewPermissionWorkflowRequest,
  PermissionWorkflowApprovalReport,
  PermissionWorkflowRequest,
  PermissionWorkflowStatus,
} from "../types.ts"

const WORKFLOW_NAMESPACE = "mcp-hub"
const REQUEST_DATA_KEY = "request.json"
const RESOURCE_SELECTOR = `mcp.idthw.dev/resource=${PERMISSION_REQUEST_RESOURCE}`
const REQUEST_ID_PATTERN = /^\d{14}-[a-f0-9]{8}$/

type StoredConfigMap = {
  data?: Record<string, string>
  metadata?: { name?: string }
}

type ConfigMapList = {
  items?: StoredConfigMap[]
}

export class PermissionWorkflowRequestNotFoundError extends Error {}

export async function createPermissionWorkflowRequest(
  input: NewPermissionWorkflowRequest,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  const existing = (await listPermissionWorkflowRequests({}, runKubectl)).find((request) => (
    request.status === "pending"
    && request.project === input.project
    && request.mcpKeyName === input.mcpKeyName
    && request.toolName === input.toolName
    && request.requesterPrincipal === input.requesterPrincipal
  ))
  if (existing) return { created: false, request: existing }

  const now = new Date()
  const timestamp = now.toISOString().replace(/\D/g, "").slice(0, 14)
  const id = `${timestamp}-${randomUUID().replace(/-/g, "").slice(0, 8)}`
  const request = newPermissionWorkflowRequest(input, id, now.toISOString())
  const manifest = JSON.stringify(buildPermissionWorkflowConfigMap(request))
  await runKubectl(kubectlArgs(["create", "--dry-run=server", "-f", "-"]), manifest)
  await runKubectl(kubectlArgs(["create", "-f", "-"]), manifest)
  return { created: true, request }
}

export async function listPermissionWorkflowRequests(
  filters: {
    mcpKeyName?: string
    project?: string
    requesterUsername?: string
    status?: PermissionWorkflowStatus
  } = {},
  runKubectl: KubectlRunner = runKubectlCommand,
): Promise<PermissionWorkflowRequest[]> {
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
  const requests = (payload.items ?? []).map(requestFromConfigMap)
    .filter((request) => !filters.mcpKeyName || request.mcpKeyName === filters.mcpKeyName)
    .filter((request) => !filters.project || request.project === filters.project)
    .filter((request) => !filters.requesterUsername || request.requesterUsername === filters.requesterUsername)
    .filter((request) => !filters.status || request.status === filters.status)
  return requests.sort((left, right) => {
    if (left.status !== right.status) return left.status === "pending" ? -1 : 1
    return right.createdAt.localeCompare(left.createdAt)
  })
}

export async function getPermissionWorkflowRequest(
  requestId: string,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  assertRequestId(requestId)
  const result = await runKubectl(kubectlArgs([
    "get",
    `configmap/${PERMISSION_REQUEST_PREFIX}${requestId}`,
    "--namespace",
    WORKFLOW_NAMESPACE,
    "--ignore-not-found",
    "-o",
    "json",
  ]))
  if (!result.stdout.trim()) throw new PermissionWorkflowRequestNotFoundError("Permission request not found")
  return requestFromConfigMap(JSON.parse(result.stdout) as StoredConfigMap)
}

export async function markPermissionWorkflowRequestApproved(
  request: PermissionWorkflowRequest,
  report: PermissionWorkflowApprovalReport,
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  const approved = approvedPermissionWorkflowRequest(request, new Date().toISOString(), report)
  const patchDirectory = await mkdtemp(join(tmpdir(), "idthw-permission-request-patch-"))
  const patchPath = join(patchDirectory, "patch.json")
  try {
    await writeFile(patchPath, JSON.stringify({
      data: { [REQUEST_DATA_KEY]: JSON.stringify(approved) },
      metadata: { labels: { "mcp.idthw.dev/status": "approved" } },
    }), { encoding: "utf8", mode: 0o600 })
    const args = [
      "patch",
      `configmap/${PERMISSION_REQUEST_PREFIX}${request.id}`,
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

export async function deleteApprovedPermissionWorkflowRequests(
  runKubectl: KubectlRunner = runKubectlCommand,
) {
  const approved = await listPermissionWorkflowRequests({ status: "approved" }, runKubectl)
  if (approved.length === 0) return { deleted: 0 }
  const resources = approved.map(({ id }) => `configmap/${PERMISSION_REQUEST_PREFIX}${id}`)
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

function requestFromConfigMap(configMap: StoredConfigMap) {
  const name = configMap.metadata?.name ?? ""
  if (!name.startsWith(PERMISSION_REQUEST_PREFIX)) throw new Error("Permission request ConfigMap name is invalid")
  const rawRequest = configMap.data?.[REQUEST_DATA_KEY]
  if (!rawRequest) throw new Error(`Permission request ConfigMap ${name} is missing ${REQUEST_DATA_KEY}`)
  const request = parsePermissionWorkflowRequest(JSON.parse(rawRequest) as unknown)
  if (name !== `${PERMISSION_REQUEST_PREFIX}${request.id}`) {
    throw new Error(`Permission request ConfigMap ${name} does not match its request id`)
  }
  return request
}

function assertRequestId(requestId: string) {
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new PermissionWorkflowRequestNotFoundError("Permission request not found")
}
