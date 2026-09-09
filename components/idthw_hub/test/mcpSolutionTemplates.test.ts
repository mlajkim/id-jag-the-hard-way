import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import type { ToolPermissionSettings } from "../features/permissions/types/permissions.ts"
import type { ZmsRequest } from "../features/registration/api/mcpManagedAccess.ts"
import {
  applyMcpExchangeHelperSolutionTemplates,
  applyMcpHubManagedAccessSolutionTemplate,
  MCP_EXCHANGE_HELPERS_TEMPLATE,
  MCP_HUB_MANAGED_ACCESS_TEMPLATE,
  mcpExchangeHelperTargets,
} from "../features/registration/api/mcpSolutionTemplates.ts"

const SETTINGS: ToolPermissionSettings = {
  version: 1,
  tools: {
    get_docs: {
      requirements: [{
        includeExchangeHelpers: true,
        label: "Signed-in user can read documentation",
        member: "<signed_in_user>",
        role: "api:role.docs-getter",
      }],
    },
    search_docs: {
      requirements: [{
        includeExchangeHelpers: true,
        label: "Signed-in user can search documentation",
        member: "<signed_in_user>",
        role: "api:role.docs-getter",
      }],
    },
  },
}

test("applies the Hub-managed access solution template with stable parameters", async () => {
  const calls: Array<{ body?: unknown; method: string; path: string }> = []
  const request: ZmsRequest = async (method, path, body) => {
    calls.push({ body, method, path })
    return { body: "{}", status: method === "PUT" ? 204 : 200 }
  }

  await applyMcpHubManagedAccessSolutionTemplate(
    "k8s-docs-server",
    "docs-mcp",
    "mcp-hub.mcps.k8s-docs-server.runtime",
    request,
  )

  assert.deepEqual(calls[2], {
    body: {
      params: [
        { name: "mcp_key", value: "docs-mcp" },
        { name: "source_service", value: "runtime" },
      ],
      templateNames: [MCP_HUB_MANAGED_ACCESS_TEMPLATE],
    },
    method: "PUT",
    path: "/domain/mcp-hub.mcps.k8s-docs-server/template",
  })
})

test("deduplicates targets and applies verified downstream exchange helpers", async () => {
  const templateCalls: Array<{ body?: unknown; path: string }> = []
  let applied = false
  const request: ZmsRequest = async (method, path, body) => {
    if (method === "PUT") {
      applied = true
      templateCalls.push({ body, path })
      return { body: "", status: 204 }
    }
    if (path === "/domain/api/role/docs-getter") return { body: "{}", status: 200 }
    if (!applied) return { body: "", status: 404 }
    if (path === "/domain/api/role/docs-getter-exchanger") {
      return {
        body: JSON.stringify({
          roleMembers: [{ memberName: "mcp-hub.mcps.k8s-docs-server.runtime" }],
        }),
        status: 200,
      }
    }
    if (path === "/domain/api/role/docs-getter-jag-exchanger") {
      return {
        body: JSON.stringify({ roleMembers: [{ memberName: "mcp-hub.mcp-gateway" }] }),
        status: 200,
      }
    }
    if (path === "/domain/api/policy/docs-getter-exchanger") {
      return {
        body: JSON.stringify({
          assertions: [{
            action: "zts.token_target_exchange",
            resource: "api:mcp-hub.mcps.k8s-docs-server:role.docs-getter",
            role: "api:role.docs-getter-exchanger",
          }],
        }),
        status: 200,
      }
    }
    if (path === "/domain/api/policy/docs-getter-jag-exchanger") {
      return {
        body: JSON.stringify({
          assertions: [{
            action: "zts.jag_exchange",
            resource: "api:role.docs-getter",
            role: "api:role.docs-getter-jag-exchanger",
          }],
        }),
        status: 200,
      }
    }
    throw new Error(`Unexpected ZMS request: ${method} ${path}`)
  }

  assert.deepEqual(mcpExchangeHelperTargets(SETTINGS), [{ domain: "api", role: "docs-getter" }])
  const report = await applyMcpExchangeHelperSolutionTemplates(
    SETTINGS,
    "mcp-hub.mcps.k8s-docs-server",
    "mcp-hub.mcps.k8s-docs-server.runtime",
    request,
  )

  assert.equal(report.templatesApplied, 1)
  assert.deepEqual(templateCalls, [{
    body: {
      params: [
        { name: "target_role", value: "docs-getter" },
        { name: "source_audience", value: "mcp-hub.mcps.k8s-docs-server" },
        {
          name: "source_principal",
          value: "mcp-hub.mcps.k8s-docs-server.runtime",
        },
      ],
      templateNames: [MCP_EXCHANGE_HELPERS_TEMPLATE],
    },
    path: "/domain/api/template",
  }])
})

test("keeps the two MCP solution templates in separate static files", async () => {
  const managed = JSON.parse(await readFile(
    new URL("../../../faqs/statics/mcp-hub-managed-access-solution-template.json", import.meta.url),
    "utf8",
  )) as { templates?: Record<string, unknown> }
  const downstream = JSON.parse(await readFile(
    new URL("../../../faqs/statics/mcp-exchange-helpers-solution-template.json", import.meta.url),
    "utf8",
  )) as { templates?: Record<string, unknown> }

  assert.deepEqual(Object.keys(managed.templates ?? {}), [MCP_HUB_MANAGED_ACCESS_TEMPLATE])
  assert.deepEqual(Object.keys(downstream.templates ?? {}), [MCP_EXCHANGE_HELPERS_TEMPLATE])

  const helper = downstream.templates?.[MCP_EXCHANGE_HELPERS_TEMPLATE] as {
    metadata?: { keywordsToReplace?: string }
  }
  assert.equal(helper.metadata?.keywordsToReplace?.includes("_source_domain_"), false)
})
