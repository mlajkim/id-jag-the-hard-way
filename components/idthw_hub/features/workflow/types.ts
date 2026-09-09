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

export type WorkflowFormTemplateField = {
  id: string
  label: string
  options: string[]
  required: boolean
  type: "bullet-list" | "text"
}

export type WorkflowFormTemplate = {
  applicationContent: string
  createdAt: string
  createdBy: string
  fields: WorkflowFormTemplateField[]
  id: string
  subject: string
  version: 1
}

export type NewWorkflowFormTemplate = Pick<
  WorkflowFormTemplate,
  "applicationContent" | "createdBy" | "id" | "subject"
> & {
  fields: Array<Omit<WorkflowFormTemplateField, "id">>
}
