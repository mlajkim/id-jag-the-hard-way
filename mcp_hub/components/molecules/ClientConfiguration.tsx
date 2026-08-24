"use client"

import { Play } from "lucide-react"
import { useState } from "react"
import { CopyButton } from "@/components/atoms/CopyButton"

type ClientKey = "github-copilot" | "claude-code" | "opencode" | "codex" | "cline" | "cursor" | "gemini"
type ScopeKey = "project" | "global"

type ScopeInstruction = {
  label: string
  path?: string
  steps: string[]
}

type ClientConfig = {
  key: ClientKey
  label: string
  format: "JSON" | "TOML"
  setupTitle?: string
  setupCopy?: string
  project: ScopeInstruction
  global: ScopeInstruction
  buildConfig: (serverName: string, mcpServerUrl: string) => string
}

type ConnectorSpec = {
  installCommand?: string
  command: string
  args: string[]
  env: Record<string, string>
}

const CLIENTS: ClientConfig[] = [
  {
    key: "github-copilot",
    label: "GitHub Copilot",
    format: "JSON",
    setupTitle: "Install GitHub Copilot configuration",
    setupCopy: "One-click install will use this server URL and JSON settings when the client action is wired.",
    project: {
      label: "Project",
      path: ".vscode/mcp.json",
      steps: ["Create this file in your project root.", "Paste the JSON."],
    },
    global: {
      label: "User",
      steps: ["Open the VS Code Command Palette.", 'Search for "MCP: Open User Configuration".', "Paste the JSON."],
    },
    buildConfig: (serverName, mcpServerUrl) =>
      jsonConfig({
        servers: {
          [serverName]: {
            type: "http",
            url: mcpServerUrl,
          },
        },
      }),
  },
  {
    key: "claude-code",
    label: "Claude Code",
    format: "JSON",
    project: {
      label: "Project",
      path: ".mcp.json",
      steps: ["Create this file in your project root.", "Paste the JSON."],
    },
    global: {
      label: "User",
      path: "~/.claude.json",
      steps: ["Open your Claude Code user configuration.", "Add this server under mcpServers.", "Paste the JSON."],
    },
    buildConfig: (serverName, mcpServerUrl) =>
      jsonConfig({
        mcpServers: {
          [serverName]: {
            type: "http",
            url: mcpServerUrl,
          },
        },
      }),
  },
  {
    key: "opencode",
    label: "OpenCode",
    format: "JSON",
    project: {
      label: "Project",
      path: "opencode.json",
      steps: ["Create this file in your project root.", "Paste the JSON."],
    },
    global: {
      label: "User",
      path: "~/.config/opencode/opencode.json",
      steps: ["Open your OpenCode user configuration.", "Add this server under mcp.", "Paste the JSON."],
    },
    buildConfig: (serverName, mcpServerUrl) =>
      jsonConfig({
        mcp: {
          [serverName]: {
            type: "remote",
            url: mcpServerUrl,
            enabled: true,
          },
        },
      }),
  },
  {
    key: "codex",
    label: "Codex",
    format: "TOML",
    project: {
      label: "Project",
      path: ".codex/config.toml",
      steps: ["Create this file in your project root.", "Paste the TOML."],
    },
    global: {
      label: "User",
      path: "~/.codex/config.toml",
      steps: ["Open your Codex configuration.", "Add this server entry.", "Paste the TOML."],
    },
    buildConfig: (serverName, mcpServerUrl) =>
      [
        `[mcp_servers.${tomlTableKey(serverName)}]`,
        `type = "http"`,
        `url = "${tomlBasicString(mcpServerUrl)}"`,
      ].join("\n"),
  },
  {
    key: "cline",
    label: "Cline",
    format: "JSON",
    project: {
      label: "Project",
      path: "cline_mcp_settings.json",
      steps: [
        "Click the MCP Servers icon at the top navigation bar of the Cline pane.",
        'Select the "Configure" tab.',
        'Click the "Configure MCP Servers" button.',
      ],
    },
    global: {
      label: "User",
      path: "cline_mcp_settings.json",
      steps: ["Open Cline MCP server settings.", "Add this server configuration.", "Paste the JSON."],
    },
    buildConfig: (serverName, mcpServerUrl) =>
      jsonConfig({
        mcpServers: {
          [serverName]: {
            type: "http",
            url: mcpServerUrl,
          },
        },
      }),
  },
  {
    key: "cursor",
    label: "Cursor",
    format: "JSON",
    setupTitle: "Configure via Cursor",
    setupCopy: "Use the JSON settings below for either project scope or global scope.",
    project: {
      label: "Project",
      path: ".cursor/mcp.json",
      steps: ["Go to the following location.", "Paste the JSON."],
    },
    global: {
      label: "Global",
      path: "~/.cursor/mcp.json",
      steps: ["Go to the following location.", "Paste the JSON."],
    },
    buildConfig: (serverName, mcpServerUrl) =>
      jsonConfig({
        mcpServers: {
          [serverName]: {
            type: "http",
            url: mcpServerUrl,
          },
        },
      }),
  },
  {
    key: "gemini",
    label: "Gemini",
    format: "JSON",
    setupTitle: "Configure via CLI",
    setupCopy: "Copy the configuration and apply it to the Gemini settings file for the selected scope.",
    project: {
      label: "Project",
      path: ".gemini/settings.json",
      steps: ["Go to the following location.", "Paste the JSON."],
    },
    global: {
      label: "Global",
      path: "~/.gemini/settings.json",
      steps: ["Go to the following location.", "Paste the JSON."],
    },
    buildConfig: (serverName, mcpServerUrl) =>
      jsonConfig({
        mcpServers: {
          [serverName]: {
            type: "http",
            url: mcpServerUrl,
          },
        },
      }),
  },
]

function jsonConfig(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function tomlTableKey(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : `"${tomlBasicString(value)}"`
}

function tomlBasicString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function ClientConfiguration({
  serverName,
  mcpServerUrl,
  connectorCommand,
  connectorRepositoryRoot,
}: {
  serverName: string
  mcpServerUrl: string
  connectorCommand?: string
  connectorRepositoryRoot?: string
}) {
  const [clientKey, setClientKey] = useState<ClientKey>("github-copilot")
  const [scope, setScope] = useState<ScopeKey>("project")
  const repositoryRoot = connectorRepositoryRoot ?? ""
  const client = CLIENTS.find((item) => item.key === clientKey) ?? CLIENTS[0]
  const selectedScope = client[scope]
  const connector = connectorCommand ? parseConnectorCommand(connectorCommand) : undefined
  const config = connector
    ? buildConnectorConfig(client.key, serverName, connector, repositoryRoot)
    : client.buildConfig(serverName, mcpServerUrl)

  return (
    <div className="config-workbench">
      <div className="client-tabs" aria-label="MCP client configuration examples">
        {CLIENTS.map((item) => (
          <button
            key={item.key}
            className={`client-tab ${item.key === client.key ? "active" : ""}`}
            type="button"
            onClick={() => {
              setClientKey(item.key)
              setScope("project")
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="config-workbench-body">
        <div className="setup-summary">
          <div>
            <span className="config-eyebrow">Automatic setup</span>
            <h3>{connector ? `Connect with ${client.label}` : client.setupTitle ?? `Install ${client.label} configuration`}</h3>
            <p>
              {connector
                ? `Install the local connector dependencies, then add the generated stdio configuration to ${client.label}.`
                : client.setupCopy ?? `Automatic setup is planned. Use the ${client.format} settings below for now.`}
            </p>
          </div>
          <button className="install-button" type="button" disabled>
            <Play size={12} aria-hidden="true" />
            One click install
          </button>
        </div>

        {connector?.installCommand && (
          <div className="connector-prerequisite">
            <div>
              <span className="config-eyebrow">Prerequisite</span>
              <strong>Install connector dependencies</strong>
            </div>
            <div className="connector-prerequisite-command">
              <code>{absoluteInstallCommand(connector.installCommand, repositoryRoot)}</code>
              <CopyButton value={absoluteInstallCommand(connector.installCommand, repositoryRoot)} label="Copy connector install command" />
            </div>
          </div>
        )}

        <div className="manual-config" aria-label="Manual configuration">
          <div className="manual-heading">
            <span className="config-eyebrow">Manual setup</span>
            <h3>{connector ? "Configure the local connector" : "Configure in config file"}</h3>
            <p>
              {connector
                ? "Choose a client and scope to see the matching stdio configuration and save location."
                : "Choose a client and scope to see the matching config and save location."}
            </p>
          </div>

          <div className="manual-grid">
            <div className="config-rail">
              <div className="config-step-card">
                <span className="step-marker">1</span>
                <div>
                  <h4>Copy the {client.format} configuration</h4>
                  <p>
                    {connector
                      ? `This sample starts the Pattern 2b local connector from ${client.label}.`
                      : `This sample is generated for ${client.label} using the current MCP server URL.`}
                  </p>
                </div>
              </div>

              <div className="config-step-card">
                <span className="step-marker">2</span>
                <div>
                  <h4>Save the configuration based on scope</h4>
                  <p>Scope determines whether this applies at the project level or globally.</p>
                  <div className="scope-config">
                    <div className="scope-tabs" aria-label="Configuration scope">
                      {(["project", "global"] as const).map((scopeKey) => (
                        <button
                          key={scopeKey}
                          className={`scope-tab ${scope === scopeKey ? "active" : ""}`}
                          type="button"
                          onClick={() => setScope(scopeKey)}
                        >
                          {client[scopeKey].label}
                        </button>
                      ))}
                    </div>

                    <div className="scope-panel">
                      {selectedScope.steps.map((step, index) => (
                        <div className="scope-instruction" key={step}>
                          <span>{index + 1}</span>
                          <p>{step}</p>
                        </div>
                      ))}
                      {selectedScope.path && <code>{selectedScope.path}</code>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="code-panel">
              <div className="code-panel-title">Copy the {client.format} configuration</div>
              <CopyButton value={config} label={`Copy ${client.format} configuration`} className="code-copy" />
              <pre className="config-code">
                <code>{config}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function parseConnectorCommand(value: string): ConnectorSpec {
  const installCommand = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("npm --prefix"))

  const commandMatch = value.match(/--\s+(?:\\\s+)*(\S+)\s+([^\r\n]+)/) ?? value.match(/^\s*(node)\s+([^\r\n]+)/m)
  const command = commandMatch?.[1] ?? "node"
  const args = commandMatch ? shellWords(commandMatch[2]).map((arg) => arg.replace(/^\$PWD\//, "")) : []
  const env = Object.fromEntries(
    Array.from(value.matchAll(/(?:^|\s)-e\s+([A-Za-z_][A-Za-z0-9_]*)=([^\s]+)/g), (match) => [match[1], match[2]]),
  )

  return { installCommand, command, args, env }
}

function shellWords(value: string) {
  return Array.from(value.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g), (match) => match[1] ?? match[2] ?? match[3])
}

function buildConnectorConfig(clientKey: ClientKey, serverName: string, connector: ConnectorSpec, repositoryRoot: string) {
  const args = connector.args.map((arg) => absoluteConnectorPath(arg, repositoryRoot))
  const server = {
    command: connector.command,
    args,
    ...(Object.keys(connector.env).length > 0 ? { env: connector.env } : {}),
  }

  switch (clientKey) {
    case "github-copilot":
      return jsonConfig({ servers: { [serverName]: { type: "stdio", ...server } } })
    case "opencode":
      return jsonConfig({
        mcp: {
          [serverName]: {
            type: "local",
            command: [connector.command, ...args],
            ...(Object.keys(connector.env).length > 0 ? { environment: connector.env } : {}),
            enabled: true,
          },
        },
      })
    case "codex":
      return [
        `[mcp_servers.${tomlTableKey(serverName)}]`,
        `command = "${tomlBasicString(connector.command)}"`,
        `args = [${args.map((arg) => `"${tomlBasicString(arg)}"`).join(", ")}]`,
        ...(Object.keys(connector.env).length > 0 ? [`env = ${tomlInlineTable(connector.env)}`] : []),
      ].join("\n")
    default:
      return jsonConfig({ mcpServers: { [serverName]: server } })
  }
}

function absoluteConnectorPath(value: string, repositoryRoot: string) {
  if (!repositoryRoot.trim() || /^(?:[A-Za-z]:[\\/]|[\\/])/.test(value)) {
    return value
  }

  return `${repositoryRoot.trim().replace(/[\\/]+$/, "")}/${value.replace(/^[\\/]+/, "")}`
}

function absoluteInstallCommand(value: string, repositoryRoot: string) {
  const match = value.match(/^(npm --prefix\s+)(\S+)(\s+.*)?$/)
  if (!match) {
    return value
  }

  return `${match[1]}${absoluteConnectorPath(match[2], repositoryRoot)}${match[3] ?? ""}`
}

function tomlInlineTable(value: Record<string, string>) {
  return `{ ${Object.entries(value).map(([key, item]) => `${tomlTableKey(key)} = "${tomlBasicString(item)}"`).join(", ")} }`
}
