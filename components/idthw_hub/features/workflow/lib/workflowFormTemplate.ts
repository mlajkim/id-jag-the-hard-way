import type {
  NewWorkflowFormTemplate,
  WorkflowFormTemplate,
  WorkflowFormTemplateField,
} from "../types.ts"

export const WORKFLOW_FORM_TEMPLATE_PREFIX = "workflow-form-template-"
export const WORKFLOW_FORM_TEMPLATE_RESOURCE = "workflow-form-template"

const TEMPLATE_ID_PATTERN = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/
const FIELD_ID_PATTERN = /^field-[1-9]\d*$/
const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const MAX_FIELDS = 30
const MAX_OPTIONS = 20

export function buildWorkflowFormTemplateConfigMap(template: WorkflowFormTemplate) {
  const validated = parseWorkflowFormTemplate(template)
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: `${WORKFLOW_FORM_TEMPLATE_PREFIX}${validated.id}`,
      namespace: "mcp-hub",
      labels: {
        "app.kubernetes.io/part-of": "idthw-hub",
        "mcp.idthw.dev/resource": WORKFLOW_FORM_TEMPLATE_RESOURCE,
      },
      annotations: {
        "mcp.idthw.dev/created-by": validated.createdBy,
      },
    },
    data: {
      "template.json": JSON.stringify(validated),
    },
  }
}

export function newWorkflowFormTemplate(
  input: NewWorkflowFormTemplate,
  createdAt: string,
): WorkflowFormTemplate {
  return parseWorkflowFormTemplate({
    ...input,
    createdAt,
    fields: input.fields.map((field, index) => ({
      ...field,
      id: `field-${index + 1}`,
    })),
    version: 1,
  })
}

export function parseNewWorkflowFormTemplate(value: unknown): Omit<NewWorkflowFormTemplate, "createdBy"> {
  const root = requireRecord(value, "workflow form template")
  assertOnlyKeys(root, ["applicationContent", "fields", "id", "subject"], "workflow form template")
  const id = requireString(root.id, "workflow form template id")
  if (!TEMPLATE_ID_PATTERN.test(id)) {
    throw new Error("Workflow form template ID must use lowercase letters, numbers, or hyphens")
  }
  return {
    applicationContent: requireDisplayString(
      root.applicationContent,
      "workflow form template application content",
      10_000,
    ),
    fields: parseFields(root.fields, false).map(({ label, options, required, type }) => ({
      label,
      options,
      required,
      type,
    })),
    id,
    subject: requireDisplayString(root.subject, "workflow form template subject", 200),
  }
}

export function parseWorkflowFormTemplate(value: unknown): WorkflowFormTemplate {
  const root = requireRecord(value, "workflow form template")
  assertOnlyKeys(root, [
    "applicationContent",
    "createdAt",
    "createdBy",
    "fields",
    "id",
    "subject",
    "version",
  ], "workflow form template")
  if (root.version !== 1) throw new Error("Workflow form template version must be 1")

  const id = requireString(root.id, "workflow form template id")
  if (!TEMPLATE_ID_PATTERN.test(id)) throw new Error("Workflow form template id is invalid")
  const createdBy = requireString(root.createdBy, "workflow form template creator")
  if (!USERNAME_PATTERN.test(createdBy)) throw new Error("Workflow form template creator is invalid")

  return {
    applicationContent: requireDisplayString(
      root.applicationContent,
      "workflow form template application content",
      10_000,
    ),
    createdAt: requireTimestamp(root.createdAt, "workflow form template creation time"),
    createdBy,
    fields: parseFields(root.fields, true),
    id,
    subject: requireDisplayString(root.subject, "workflow form template subject", 200),
    version: 1,
  }
}

export function isWorkflowFormTemplateId(value: string) {
  return TEMPLATE_ID_PATTERN.test(value)
}

function parseFields(value: unknown, requireIds: boolean): WorkflowFormTemplateField[] {
  if (!Array.isArray(value)) throw new Error("Workflow form template fields must be an array")
  if (value.length > MAX_FIELDS) throw new Error(`Workflow form template supports up to ${MAX_FIELDS} fields`)
  return value.map((entry, index) => {
    const field = requireRecord(entry, `workflow form template field ${index + 1}`)
    assertOnlyKeys(
      field,
      requireIds
        ? ["id", "label", "options", "required", "type"]
        : ["label", "options", "required", "type"],
      `workflow form template field ${index + 1}`,
    )
    const id = requireIds
      ? requireString(field.id, `workflow form template field ${index + 1} id`)
      : `field-${index + 1}`
    if (!FIELD_ID_PATTERN.test(id)) throw new Error(`Workflow form template field ${index + 1} id is invalid`)
    if (field.required !== true && field.required !== false) {
      throw new Error(`Workflow form template field ${index + 1} required value is invalid`)
    }
    const type = field.type === undefined ? "text" : field.type
    if (type !== "text" && type !== "bullet-list") {
      throw new Error(`Workflow form template field ${index + 1} type is invalid`)
    }
    const options = parseOptions(field.options, index, type)
    return {
      id,
      label: requireDisplayString(field.label, `workflow form template field ${index + 1} label`, 120),
      options,
      required: field.required,
      type,
    }
  })
}

function parseOptions(value: unknown, fieldIndex: number, type: "bullet-list" | "text") {
  if (value === undefined && type === "text") return []
  if (!Array.isArray(value)) {
    throw new Error(`Workflow form template field ${fieldIndex + 1} options must be an array`)
  }
  if (value.length > MAX_OPTIONS) {
    throw new Error(`Workflow form template field ${fieldIndex + 1} supports up to ${MAX_OPTIONS} options`)
  }
  const options = value.map((option, optionIndex) => requireDisplayString(
    option,
    `workflow form template field ${fieldIndex + 1} option ${optionIndex + 1}`,
    120,
  ))
  if (type === "bullet-list" && options.length === 0) {
    throw new Error(`Workflow form template field ${fieldIndex + 1} requires at least one option`)
  }
  if (type === "text" && options.length > 0) {
    throw new Error(`Workflow form template field ${fieldIndex + 1} plain text type cannot contain options`)
  }
  return options
}

function requireDisplayString(value: unknown, location: string, maxLength: number) {
  const text = requireString(value, location)
  if (text.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new Error(`${location} is invalid`)
  }
  return text
}

function requireString(value: unknown, location: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${location} is required`)
  return value.trim()
}

function requireTimestamp(value: unknown, location: string) {
  const timestamp = requireString(value, location)
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${location} is invalid`)
  return timestamp
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
