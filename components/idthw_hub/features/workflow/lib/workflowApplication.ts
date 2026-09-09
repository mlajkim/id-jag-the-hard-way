import type {
  WorkflowApplication,
  WorkflowApplicationAnswer,
  WorkflowFormTemplate,
} from "../types.ts"

export const WORKFLOW_APPLICATION_PREFIX = "workflow-application-"
export const WORKFLOW_APPLICATION_RESOURCE = "workflow-application"

const APPLICATION_ID_PATTERN = /^\d{14}-[a-f0-9]{8}$/
const FIELD_ID_PATTERN = /^field-[1-9]\d*$/
const TEMPLATE_ID_PATTERN = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/
const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/

export class WorkflowApplicationTemplateVersionConflictError extends Error {}

export function applicationAnswersFromPayload(
  template: WorkflowFormTemplate,
  value: unknown,
): WorkflowApplicationAnswer[] {
  const root = requireRecord(value, "workflow application")
  assertOnlyKeys(root, ["answers", "templateVersion"], "workflow application")
  const templateVersion = root.templateVersion === undefined
    ? template.version
    : requirePositiveInteger(root.templateVersion, "workflow application template version")
  if (templateVersion !== template.version) {
    throw new WorkflowApplicationTemplateVersionConflictError(
      `Workflow form template is now version ${template.version}; reload before submitting`,
    )
  }
  const submittedAnswers = requireRecord(root.answers, "workflow application answers")
  const fieldIds = new Set(template.fields.map(({ id }) => id))
  const unexpected = Object.keys(submittedAnswers).find((fieldId) => !fieldIds.has(fieldId))
  if (unexpected) throw new Error(`Workflow application contains unknown field ${unexpected}`)

  return template.fields.map((field) => {
    const rawValue = submittedAnswers[field.id]
    if (rawValue !== undefined && typeof rawValue !== "string") {
      throw new Error(`Workflow application answer for ${field.label} is invalid`)
    }
    const answer = typeof rawValue === "string" ? rawValue.trim() : ""
    if (field.required && !answer) {
      throw new Error(`${field.label} is required`)
    }
    if (field.type === "bullet-list" && answer && !field.options.includes(answer)) {
      throw new Error(`Workflow application answer for ${field.label} is invalid`)
    }
    if (answer.length > 10_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(answer)) {
      throw new Error(`Workflow application answer for ${field.label} is invalid`)
    }
    return { fieldId: field.id, label: field.label, value: answer }
  })
}

export function newWorkflowApplication({
  answers,
  createdAt,
  createdBy,
  id,
  template,
}: {
  answers: WorkflowApplicationAnswer[]
  createdAt: string
  createdBy: string
  id: string
  template: WorkflowFormTemplate
}): WorkflowApplication {
  return parseWorkflowApplication({
    answers,
    createdAt,
    createdBy,
    id,
    operatorProcedureUrl: template.operatorProcedureUrl,
    status: "pending",
    subject: template.subject,
    templateId: template.id,
    templateVersion: template.version,
    version: 1,
  })
}

export function approvedWorkflowApplication(
  application: WorkflowApplication,
  approvedAt: string,
  approvedBy: string,
) {
  return parseWorkflowApplication({
    ...application,
    approvedAt,
    approvedBy,
    status: "approved",
  })
}

export function parseWorkflowApplication(value: unknown): WorkflowApplication {
  const root = requireRecord(value, "workflow application")
  assertOnlyKeys(root, [
    "answers",
    "approvedAt",
    "approvedBy",
    "createdAt",
    "createdBy",
    "id",
    "operatorProcedureUrl",
    "status",
    "subject",
    "templateId",
    "templateVersion",
    "version",
  ], "workflow application")
  if (root.version !== 1) throw new Error("Workflow application version must be 1")

  const id = requireString(root.id, "workflow application id")
  if (!APPLICATION_ID_PATTERN.test(id)) throw new Error("Workflow application id is invalid")
  const templateId = requireString(root.templateId, "workflow application template id")
  if (!TEMPLATE_ID_PATTERN.test(templateId)) throw new Error("Workflow application template id is invalid")
  const operatorProcedureUrl = parseOptionalHttpUrl(
    root.operatorProcedureUrl,
    "workflow application operator procedure URL",
  )
  const createdBy = requireUsername(root.createdBy, "workflow application creator")
  const status = root.status === undefined ? "pending" : root.status
  if (status !== "pending" && status !== "approved") {
    throw new Error("Workflow application status is invalid")
  }
  const approvedAt = root.approvedAt === undefined
    ? undefined
    : requireTimestamp(root.approvedAt, "workflow application approval time")
  const approvedBy = root.approvedBy === undefined
    ? undefined
    : requireUsername(root.approvedBy, "workflow application approver")
  if (status === "approved" && (!approvedAt || !approvedBy)) {
    throw new Error("Approved workflow application requires approval details")
  }
  if (status === "pending" && (approvedAt || approvedBy)) {
    throw new Error("Pending workflow application cannot contain approval details")
  }

  return {
    answers: parseAnswers(root.answers),
    ...(approvedAt ? { approvedAt } : {}),
    ...(approvedBy ? { approvedBy } : {}),
    createdAt: requireTimestamp(root.createdAt, "workflow application creation time"),
    createdBy,
    id,
    ...(operatorProcedureUrl ? { operatorProcedureUrl } : {}),
    status,
    subject: requireDisplayString(root.subject, "workflow application subject", 200),
    templateId,
    templateVersion: root.templateVersion === undefined
      ? 1
      : requirePositiveInteger(root.templateVersion, "workflow application template version"),
    version: 1,
  }
}

export function buildWorkflowApplicationConfigMap(application: WorkflowApplication) {
  const validated = parseWorkflowApplication(application)
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: `${WORKFLOW_APPLICATION_PREFIX}${validated.id}`,
      namespace: "mcp-hub",
      labels: {
        "app.kubernetes.io/part-of": "idthw-hub",
        "mcp.idthw.dev/resource": WORKFLOW_APPLICATION_RESOURCE,
        "mcp.idthw.dev/status": validated.status,
        "mcp.idthw.dev/workflow-template": validated.templateId,
        "mcp.idthw.dev/workflow-template-version": String(validated.templateVersion),
      },
      annotations: {
        "mcp.idthw.dev/created-by": validated.createdBy,
      },
    },
    data: {
      "application.json": JSON.stringify(validated),
    },
  }
}

function parseAnswers(value: unknown): WorkflowApplicationAnswer[] {
  if (!Array.isArray(value) || value.length > 30) {
    throw new Error("Workflow application answers are invalid")
  }
  const seen = new Set<string>()
  return value.map((entry, index) => {
    const answer = requireRecord(entry, `workflow application answer ${index + 1}`)
    assertOnlyKeys(answer, ["fieldId", "label", "value"], `workflow application answer ${index + 1}`)
    const fieldId = requireString(answer.fieldId, `workflow application answer ${index + 1} field id`)
    if (!FIELD_ID_PATTERN.test(fieldId) || seen.has(fieldId)) {
      throw new Error(`Workflow application answer ${index + 1} field id is invalid`)
    }
    seen.add(fieldId)
    return {
      fieldId,
      label: requireDisplayString(answer.label, `workflow application answer ${index + 1} label`, 120),
      value: requireDisplayString(answer.value, `workflow application answer ${index + 1} value`, 10_000, true),
    }
  })
}

function requireUsername(value: unknown, location: string) {
  const username = requireString(value, location)
  if (!USERNAME_PATTERN.test(username)) throw new Error(`${location} is invalid`)
  return username
}

function requireTimestamp(value: unknown, location: string) {
  const timestamp = requireString(value, location)
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${location} is invalid`)
  return timestamp
}

function requireDisplayString(
  value: unknown,
  location: string,
  maxLength: number,
  allowEmpty = false,
) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`${location} is required`)
  const text = value.trim()
  if (text.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new Error(`${location} is invalid`)
  }
  return text
}

function requireString(value: unknown, location: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${location} is required`)
  return value.trim()
}

function requirePositiveInteger(value: unknown, location: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${location} must be a positive integer`)
  }
  return value
}

function parseOptionalHttpUrl(value: unknown, location: string) {
  if (value === undefined || value === null || value === "") return undefined
  const text = requireString(value, location)
  if (text.length > 2_048) throw new Error(`${location} is invalid`)
  try {
    const url = new URL(text)
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error()
  } catch {
    throw new Error(`${location} must use HTTP or HTTPS`)
  }
  return text
}

function requireRecord(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} must be an object`)
  }
  return value as Record<string, unknown>
}

function assertOnlyKeys(value: Record<string, unknown>, keys: string[], location: string) {
  const allowed = new Set(keys)
  const unexpected = Object.keys(value).find((key) => !allowed.has(key))
  if (unexpected) throw new Error(`${location} contains unknown field ${unexpected}`)
}
