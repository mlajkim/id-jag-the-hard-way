export type PermissionWorkflowStatus = "approved" | "pending"

export type PermissionWorkflowRequirement = {
  label: string
  member: string
  role: string
  source: "helper" | "tool"
}

export type PermissionWorkflowPolicy = {
  action: string
  effect: "ALLOW" | "DENY"
  label: string
  resource: string
  role: string
  source: "helper"
}

export type PermissionWorkflowApprovalReport = {
  changed: boolean
  membershipsAdded: number
  policiesUpdated: number
}

export type PermissionWorkflowRequest = {
  approvedAt?: string
  approvalReport?: PermissionWorkflowApprovalReport
  createdAt: string
  id: string
  mcpKeyName: string
  policies: PermissionWorkflowPolicy[]
  project: string
  requesterPrincipal: string
  requesterUsername: string
  requirements: PermissionWorkflowRequirement[]
  serverDisplayName: string
  status: PermissionWorkflowStatus
  toolName: string
  version: 1
}

export type NewPermissionWorkflowRequest = Omit<
  PermissionWorkflowRequest,
  "approvedAt" | "approvalReport" | "createdAt" | "id" | "status" | "version"
>

export type PendingToolPermissionRequest = Pick<
  PermissionWorkflowRequest,
  "id" | "status" | "toolName"
>
