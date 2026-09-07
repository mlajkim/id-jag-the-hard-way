"use client"

import { Check, ChevronDown, LayoutTemplate } from "lucide-react"
import { useEffect, useRef } from "react"
import { McpIconPreview } from "@/features/mcp-servers/components/McpIconPicker"
import type { McpIconOption } from "@/features/mcp-servers/lib/mcpIcons"
import type { McpTemplateSummary } from "../types"

export function McpTemplateSelect({
  disabled,
  iconOptions,
  onChange,
  templates,
  value,
}: {
  disabled?: boolean
  iconOptions: McpIconOption[]
  onChange: (templateKey: string) => void
  templates: McpTemplateSummary[]
  value: string
}) {
  const dropdown = useRef<HTMLDetailsElement>(null)
  const selectedTemplate = templates.find((template) => template.key === value)
  const unavailable = templates.length === 0
  const interactionDisabled = disabled || unavailable

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (dropdown.current?.open && !dropdown.current.contains(event.target as Node)) {
        dropdown.current.removeAttribute("open")
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") dropdown.current?.removeAttribute("open")
    }

    document.addEventListener("pointerdown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [])

  function selectTemplate(templateKey: string) {
    onChange(templateKey)
    dropdown.current?.removeAttribute("open")
  }

  return (
    <details
      className={`mcp-template-select${interactionDisabled ? " disabled" : ""}`}
      ref={dropdown}
    >
      <summary
        aria-disabled={interactionDisabled}
        aria-labelledby="mcp-template-label"
        onClick={(event) => {
          if (interactionDisabled) event.preventDefault()
        }}
      >
        {selectedTemplate ? (
          <McpIconPreview
            decorative
            iconOptions={iconOptions}
            name={selectedTemplate.name}
            value={selectedTemplate.iconId}
          />
        ) : (
          <span className="mcp-template-select-placeholder-icon" aria-hidden="true">
            <LayoutTemplate size={19} />
          </span>
        )}
        <span className="mcp-template-select-copy">
          <strong>{selectedTemplate?.name ?? (unavailable ? "No MCP templates found" : "Select an MCP template")}</strong>
          <small>{selectedTemplate?.key ?? (unavailable ? "Create a template to continue" : "Choose from this project")}</small>
        </span>
        <ChevronDown className="mcp-template-select-chevron" size={17} aria-hidden="true" />
      </summary>

      <div className="mcp-template-select-menu" role="listbox" aria-label="MCP templates">
        {templates.map((template) => {
          const selected = template.key === value
          return (
            <button
              aria-selected={selected}
              className={`mcp-template-select-option${selected ? " selected" : ""}`}
              key={template.key}
              onClick={() => selectTemplate(template.key)}
              role="option"
              type="button"
            >
              <McpIconPreview
                decorative
                iconOptions={iconOptions}
                name={template.name}
                value={template.iconId}
              />
              <span className="mcp-template-select-copy">
                <strong>{template.name}</strong>
                <small>{template.key}</small>
              </span>
              {selected ? <Check size={17} aria-label="Selected" /> : null}
            </button>
          )
        })}
      </div>
    </details>
  )
}
