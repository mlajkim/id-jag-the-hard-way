"use client"

import { CheckCircle2, ShieldCheck } from "lucide-react"
import { useState } from "react"
import type { McpTool } from "@/features/catalog/types/tools"

type ActingService = {
  label: string
  principal: string
}

export function McpAccessConfigurator({
  serverName,
  tools,
  toolsError,
  username,
}: {
  serverName: string
  tools: McpTool[]
  toolsError?: string
  username: string
}) {
  const [serviceEnabled, setServiceEnabled] = useState(false)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [reviewed, setReviewed] = useState(false)
  const actingServices: ActingService[] = [
    { label: "Codex CLI", principal: `human.${username}.codex` },
    { label: "Claude Code", principal: `human.${username}.claude` },
  ]
  const allToolsSelected = tools.length > 0 && selectedTools.length === tools.length
  const readyToReview = serviceEnabled && selectedServices.length > 0 && selectedTools.length > 0

  function toggleService(enabled: boolean) {
    setServiceEnabled(enabled)
    setReviewed(false)
    if (!enabled) {
      setSelectedServices([])
      setSelectedTools([])
    }
  }

  function toggleSelection(value: string, selected: string[], update: (next: string[]) => void) {
    update(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
    setReviewed(false)
  }

  function toggleAllTools() {
    setSelectedTools(allToolsSelected ? [] : tools.map((tool) => tool.name))
    setReviewed(false)
  }

  return (
    <section className="access-configurator" aria-labelledby="access-configurator-title">
      <div className="access-configurator-heading">
        <span className="step-marker">3</span>
        <div>
          <span className="config-eyebrow">Access &amp; delegation</span>
          <h4 id="access-configurator-title">Choose who can use this MCP service</h4>
          <p>Start with the service, then grant only the acting identities and tools you want.</p>
        </div>
        <span className="access-preview-badge">UI preview</span>
      </div>

      <label className={`service-access-toggle ${serviceEnabled ? "selected" : ""}`}>
        <input
          type="checkbox"
          checked={serviceEnabled}
          onChange={(event) => toggleService(event.target.checked)}
        />
        <span>
          <strong>I want to use {serverName}</strong>
          <small>Reveal delegation and tool-level choices for this service.</small>
        </span>
      </label>

      {serviceEnabled && (
        <div className="access-configurator-nested">
          <fieldset className="access-choice-group">
            <legend>Acting service accounts</legend>
            <p>Choose which AI clients may act on behalf of {username}.</p>
            <div className="acting-service-grid">
              {actingServices.map((service) => (
                <label className="access-choice" key={service.principal}>
                  <input
                    type="checkbox"
                    checked={selectedServices.includes(service.principal)}
                    onChange={() => toggleSelection(service.principal, selectedServices, setSelectedServices)}
                  />
                  <span>
                    <strong>{service.label}</strong>
                    <code>{service.principal}</code>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="access-choice-group tool-access-group">
            <div className="tool-access-heading">
              <div>
                <legend>Tool permissions</legend>
                <p>Each checked tool becomes part of this access draft.</p>
              </div>
              {tools.length > 0 && (
                <button type="button" onClick={toggleAllTools}>
                  {allToolsSelected ? "Clear all" : "Select all"}
                </button>
              )}
            </div>

            {toolsError ? (
              <p className="access-tools-error">Live tools are unavailable: {toolsError}</p>
            ) : tools.length === 0 ? (
              <p className="access-tools-error">This MCP server did not return any tools.</p>
            ) : (
              <div className="tool-permission-list">
                {tools.map((tool) => (
                  <label className="tool-permission-choice" key={tool.name}>
                    <input
                      type="checkbox"
                      checked={selectedTools.includes(tool.name)}
                      onChange={() => toggleSelection(tool.name, selectedTools, setSelectedTools)}
                    />
                    <span className="tool-permission-copy">
                      <strong>{tool.name}</strong>
                      <small>{tool.title ?? tool.description ?? "Allow this acting identity to invoke the tool."}</small>
                    </span>
                    <span className="tool-permission-action">Invoke</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="access-draft-footer">
            <div>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>
                <strong>{selectedServices.length} acting identities</strong>
                <small>{selectedTools.length} of {tools.length} tools selected</small>
              </span>
            </div>
            <button type="button" disabled={!readyToReview} onClick={() => setReviewed(true)}>
              Review access
            </button>
          </div>

          {reviewed && (
            <p className="access-review-result" role="status">
              <CheckCircle2 size={17} aria-hidden="true" />
              Access draft ready. No Athenz policy changes have been applied yet.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
