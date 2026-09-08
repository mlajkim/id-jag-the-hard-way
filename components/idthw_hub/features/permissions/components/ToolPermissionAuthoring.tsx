"use client"

import { Plus, Trash2 } from "lucide-react"
import { SelectMenu } from "@/components/atoms/SelectMenu"
import {
  emptyEditablePermissionRequirement,
  SIGNED_IN_USER_MEMBER,
} from "../lib/toolPermissionDraft"
import type {
  EditablePermissionRequirement,
  ToolPermissionDefault,
  ToolPermissionDraft,
} from "../types/permissions"

export function ToolPermissionAuthoring({
  description,
  defaultPermission,
  tools,
  validationError,
  onDefaultPermissionChange,
  onChange,
}: {
  description: string
  defaultPermission: ToolPermissionDefault
  tools: ToolPermissionDraft[]
  validationError?: string
  onDefaultPermissionChange: (defaultPermission: ToolPermissionDefault) => void
  onChange: (tools: ToolPermissionDraft[]) => void
}) {
  const updateTool = (id: number, values: Partial<ToolPermissionDraft>) => {
    onChange(tools.map((tool) => tool.id === id ? { ...tool, ...values } : tool))
  }

  const addTool = () => {
    if (tools.length >= 100) return
    onChange([
      ...tools,
      {
        id: Math.max(0, ...tools.map(({ id }) => id)) + 1,
        requirements: [],
        toolName: "",
      },
    ])
  }
  const hasIncompleteFields = tools.some((tool) => (
    !tool.toolName.trim()
    || tool.requirements.some((requirement) => (
      !requirement.audience.trim() || !requirement.role.trim()
    ))
  ))

  return (
    <fieldset className="mcp-create-fieldset mcp-tool-permission-authoring">
      <legend>Known tools and permissions (optional)</legend>
      <p className="mcp-create-field-copy">{description}</p>
      <div className="mcp-tool-permission-default" data-mode={defaultPermission}>
        <div className="permission-editor-field">
          <span>Default for tools without an override</span>
          <SelectMenu
            ariaLabel="Default tool permission"
            value={defaultPermission}
            options={[
              { value: "not-defined", label: "Not defined" },
              { value: "none", label: "No additional permission" },
            ]}
            onChange={(value) => onDefaultPermissionChange(value as ToolPermissionDefault)}
          />
        </div>
        <p>{defaultPermission === "none"
          ? "Every unlisted tool uses only the standard MCP server access. Add overrides for tools that need downstream access."
          : "Unlisted tools have no permission decision yet and remain visibly unconfigured."}</p>
      </div>
      <p className="mcp-tool-permission-guidance">
        Leave the <strong>permission switch</strong> off to explicitly record that a named tool requires no additional permission. Turn it on only when an audience and role are required.
      </p>
      {tools.length === 0 ? (
        <div className="permission-dialog-empty neutral mcp-tool-permission-empty">
          <strong>{defaultPermission === "none" ? "No per-tool overrides" : "No tools configured"}</strong>
          <p>{defaultPermission === "none"
            ? "All discovered tools currently use the no-additional-permission default."
            : "Add a tool when you know its MCP tool name, then choose whether it requires additional access."}</p>
        </div>
      ) : (
        <div className="mcp-tool-permission-list">
          {tools.map((tool, index) => (
            <section
              className="mcp-tool-permission-group"
              data-mode={tool.requirements.length > 0 ? "required" : "none"}
              key={tool.id}
            >
              <div className="mcp-tool-permission-head">
                <div className="mcp-tool-permission-identity">
                  <label className="permission-editor-field">
                    <span>MCP tool name</span>
                    <input
                      required
                      autoComplete="off"
                      placeholder="get_k8s_docs"
                      value={tool.toolName}
                      onChange={(event) => updateTool(tool.id, { toolName: event.target.value })}
                    />
                  </label>
                  <div className="mcp-tool-role-switch">
                    <button
                      className="mcp-tool-role-switch-button"
                      type="button"
                      role="switch"
                      aria-label="Role required"
                      aria-checked={tool.requirements.length > 0}
                      onClick={() => toggleAdditionalPermission(tool, updateTool, tool.requirements.length === 0)}
                    >
                      <span className="mcp-tool-role-switch-slider" />
                    </button>
                  </div>
                </div>
                <label className="permission-editor-field mcp-tool-permission-requirement-field">
                  <span>Audience (Athenz domain)</span>
                  <input
                    required={tool.requirements.length > 0}
                    disabled={tool.requirements.length === 0}
                    autoComplete="off"
                    placeholder={tool.requirements.length > 0 ? "api" : "Not required"}
                    value={tool.requirements[0]?.audience ?? ""}
                    onChange={(event) => updatePrimaryRequirement(tool, updateTool, {
                      audience: event.target.value,
                    })}
                  />
                </label>
                <label className="permission-editor-field mcp-tool-permission-requirement-field">
                  <span>Required role</span>
                  <input
                    required={tool.requirements.length > 0}
                    disabled={tool.requirements.length === 0}
                    autoComplete="off"
                    placeholder={tool.requirements.length > 0 ? "docs-getter" : "Not required"}
                    value={tool.requirements[0]?.role ?? ""}
                    onChange={(event) => updatePrimaryRequirement(tool, updateTool, {
                      role: event.target.value,
                    })}
                  />
                </label>
                <button
                  className="permission-editor-remove"
                  type="button"
                  aria-label={`Remove tool permission ${index + 1}`}
                  onClick={() => onChange(tools.filter(({ id }) => id !== tool.id))}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      {validationError && !hasIncompleteFields ? (
        <p className="mcp-create-service-warning" role="alert">{validationError}</p>
      ) : null}
      <button className="button" type="button" disabled={tools.length >= 100} onClick={addTool}>
        <Plus size={14} aria-hidden="true" />
        Add tool
      </button>
    </fieldset>
  )
}

function toggleAdditionalPermission(
  tool: ToolPermissionDraft,
  updateTool: (id: number, values: Partial<ToolPermissionDraft>) => void,
  checked: boolean,
) {
  if (checked) {
    const requirement = fixedRequirement(
      tool.cachedRequirement ?? tool.requirements[0] ?? emptyEditablePermissionRequirement(),
    )
    updateTool(tool.id, {
      cachedRequirement: requirement,
      requirements: [requirement],
    })
    return
  }

  const cachedRequirement = tool.requirements[0]
    ? fixedRequirement(tool.requirements[0])
    : tool.cachedRequirement
  updateTool(tool.id, {
    ...(cachedRequirement ? { cachedRequirement } : {}),
    requirements: [],
  })
}

function updatePrimaryRequirement(
  tool: ToolPermissionDraft,
  updateTool: (id: number, values: Partial<ToolPermissionDraft>) => void,
  values: Pick<Partial<EditablePermissionRequirement>, "audience" | "role">,
) {
  const requirement = fixedRequirement({
    ...(tool.requirements[0] ?? tool.cachedRequirement ?? emptyEditablePermissionRequirement()),
    ...values,
  })
  updateTool(tool.id, {
    cachedRequirement: requirement,
    requirements: [requirement],
  })
}

function fixedRequirement(
  requirement: EditablePermissionRequirement,
): EditablePermissionRequirement {
  return {
    ...requirement,
    exchangeHelpersCustomized: false,
    helperRequirements: [],
    label: "",
    member: SIGNED_IN_USER_MEMBER,
    memberType: "signed-in-user",
  }
}
