"use client"

import { CheckCircle2, ChevronDown, ChevronRight, CircleX, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { McpTool, McpToolsResult } from "@/features/catalog/types/tools"
import { PermissionRequestDialog } from "@/features/permissions/components/PermissionRequestDialog"
import {
  ToolPermissionAccessButton,
  type ToolPermissionRequestStatus,
} from "@/features/permissions/components/ToolPermissionAccessButton"
import type {
  PermissionCheckStatus,
  PermissionReadiness,
  PermissionReadinessGroup,
} from "@/features/permissions/types/permissions"

const COLLAPSED_TOOL_COUNT = 5

export function PermissionReadinessSection({
  accessAudience,
  mcpKeyName,
  serverDisplayName,
  permissionGuideLabel,
  permissionGuideUrl,
  project,
  servicePrincipal,
  stepNumber = 1,
  readiness,
  toolsResult,
}: {
  accessAudience?: string
  mcpKeyName: string
  serverDisplayName: string
  permissionGuideLabel?: string
  permissionGuideUrl?: string
  project: string
  servicePrincipal?: string
  stepNumber?: number
  readiness: PermissionReadiness | null
  toolsResult: McpToolsResult
}) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const evaluatedReadiness = readiness?.status === "configuration-error" ? undefined : readiness
  const toolGroups = new Map(
    evaluatedReadiness?.groups
      .filter((group) => group.toolName)
      .map((group) => [group.toolName as string, group]) ?? [],
  )
  const sharedGroup = evaluatedReadiness?.groups.find((group) => !group.toolName)
  const defaultGroup = evaluatedReadiness?.defaultPermission === "none" ? sharedGroup : undefined
  const hasManagedAccess = evaluatedReadiness?.groups.some((group) => (
    group.requirements.some(({ source }) => source === "managed")
  )) ?? false
  const hasCustomToolAccess = evaluatedReadiness?.groups.some((group) => (
    group.requirements.some(({ source }) => source === "tool" || source === "helper")
    || group.policies.some(({ source }) => source === "helper")
  )) ?? false
  const simplePermissionStep = hasManagedAccess
    && evaluatedReadiness?.defaultPermission === "none"
    && !hasCustomToolAccess

  return (
    <div className="permission-readiness-section" aria-labelledby="permission-readiness-heading">
      <PermissionHeading
        copy={simplePermissionStep
          ? `There are no additional permissions to review for ${serverDisplayName}. You can continue to the next step.`
          : undefined}
        isRefreshing={isRefreshing}
        onRefresh={() => startRefresh(() => router.refresh())}
        permissionGuideLabel={permissionGuideLabel}
        permissionGuideUrl={permissionGuideUrl}
        stepNumber={stepNumber}
      />

      {!simplePermissionStep && readiness?.status === "configuration-error" ? (
        <div className="permission-config-error" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <div>
            <strong>Permission preset configuration error</strong>
            <p>{readiness.message}</p>
          </div>
        </div>
      ) : null}

      {!simplePermissionStep ? <div className="permission-tools-panel">
        <div className="permission-tools-heading">
          <div>
            <span>Available tools</span>
            <h3>Tools</h3>
          </div>
          <strong>{toolsResult.tools.length} tools</strong>
        </div>

        {toolsResult.error ? (
          <div className="permission-tools-load-error" role="status">
            <TriangleAlert size={17} aria-hidden="true" />
            <span>Available tools could not be loaded: {toolsResult.error}</span>
          </div>
        ) : null}

        {toolsResult.tools.length > COLLAPSED_TOOL_COUNT ? (
          <>
            <ToolPermissionList
              accessAudience={accessAudience}
              mcpKeyName={mcpKeyName}
              permissionGuideUrl={permissionGuideUrl}
              project={project}
              servicePrincipal={servicePrincipal}
              sharedGroup={defaultGroup}
              toolGroups={toolGroups}
              tools={toolsExpanded ? toolsResult.tools : toolsResult.tools.slice(0, COLLAPSED_TOOL_COUNT)}
            />
            <button
              className="permission-tools-toggle"
              type="button"
              aria-expanded={toolsExpanded}
              onClick={() => setToolsExpanded((expanded) => !expanded)}
            >
              {toolsExpanded
                ? <ChevronDown size={15} aria-hidden="true" />
                : <ChevronRight size={15} aria-hidden="true" />}
              {toolsExpanded ? "Collapse tools" : "Expand tools"}
            </button>
          </>
        ) : toolsResult.tools.length > 0 ? (
          <ToolPermissionList
            accessAudience={accessAudience}
            mcpKeyName={mcpKeyName}
            permissionGuideUrl={permissionGuideUrl}
            project={project}
            servicePrincipal={servicePrincipal}
            sharedGroup={defaultGroup}
            toolGroups={toolGroups}
            tools={toolsResult.tools}
          />
        ) : toolsResult.error ? null : (
          <div className="permission-tools-empty">This MCP server returned no tools.</div>
        )}
      </div> : null}
    </div>
  )
}

function ToolPermissionList({
  accessAudience,
  mcpKeyName,
  permissionGuideUrl,
  project,
  servicePrincipal,
  sharedGroup,
  toolGroups,
  tools,
}: {
  accessAudience?: string
  mcpKeyName: string
  permissionGuideUrl?: string
  project: string
  servicePrincipal?: string
  sharedGroup?: PermissionReadinessGroup
  toolGroups: Map<string, PermissionReadinessGroup>
  tools: McpTool[]
}) {
  return (
    <div className="permission-tool-list">
      {tools.map((tool, index) => (
        <ToolPermissionRow
          accessAudience={accessAudience}
          group={toolGroups.get(tool.name) ?? sharedGroup}
          key={`${tool.name}:${index}`}
          mcpKeyName={mcpKeyName}
          permissionGuideUrl={permissionGuideUrl}
          project={project}
          servicePrincipal={servicePrincipal}
          tool={tool}
        />
      ))}
    </div>
  )
}

function ToolPermissionRow({
  accessAudience,
  group,
  mcpKeyName,
  permissionGuideUrl,
  project,
  servicePrincipal,
  tool,
}: {
  accessAudience?: string
  group?: PermissionReadinessGroup
  mcpKeyName: string
  permissionGuideUrl?: string
  project: string
  servicePrincipal?: string
  tool: McpTool
}) {
  if (!group) {
    return (
      <div className="permission-tool-row" data-status="unconfigured">
        <span className="permission-status-icon" aria-hidden="true"><TriangleAlert size={19} /></span>
        <div className="permission-tool-main">
          <ToolIdentity tool={tool} />
          <ToolPermissionAccessButton
            permissionGuideUrl={permissionGuideUrl}
            status="unconfigured"
            toolName={tool.name}
          />
        </div>
        <PermissionRequestDialog
          accessAudience={accessAudience}
          configurationMissing
          mcpKeyName={mcpKeyName}
          project={project}
          policies={[]}
          servicePrincipal={servicePrincipal}
          requirements={[]}
          subject={`Tool: ${tool.name}`}
          toolName={tool.name}
          triggerLabel="View permissions"
        />
      </div>
    )
  }

  const status = groupStatus(group)
  const requestStatus = customPermissionRequestStatus(group)
  return (
    <div className="permission-tool-row" data-status={status}>
      <PermissionStatusIcon status={status} />
      <div className="permission-tool-main">
        <ToolIdentity tool={tool} />
        <ToolPermissionAccessButton
          permissionGuideUrl={permissionGuideUrl}
          status={requestStatus}
          toolName={tool.name}
        />
      </div>
      <PermissionRequestDialog
        accessAudience={accessAudience}
        mcpKeyName={mcpKeyName}
        project={project}
        policies={group.policies}
        servicePrincipal={servicePrincipal}
        requirements={group.requirements}
        subject={`Tool: ${tool.name}`}
        toolName={tool.name}
        triggerLabel="View permissions"
      />
    </div>
  )
}

function ToolIdentity({ tool }: { tool: McpTool }) {
  return (
    <div className="permission-tool-identity">
      <strong>{tool.name}</strong>
    </div>
  )
}

function PermissionStatusIcon({ status }: { status: PermissionCheckStatus }) {
  return (
    <span className="permission-status-icon" aria-hidden="true">
      {status === "ready"
        ? <CheckCircle2 size={19} />
        : status === "missing"
          ? <CircleX size={19} />
          : <TriangleAlert size={19} />}
    </span>
  )
}

function PermissionHeading({
  copy,
  isRefreshing,
  onRefresh,
  permissionGuideLabel,
  permissionGuideUrl,
  stepNumber,
}: {
  copy?: string
  isRefreshing: boolean
  onRefresh: () => void
  permissionGuideLabel?: string
  permissionGuideUrl?: string
  stepNumber: number
}) {
  return (
    <div className="permission-readiness-heading">
      <div className="permission-heading-step">
        <span className="step-marker">{stepNumber}</span>
        <div>
          <h3 id="permission-readiness-heading" className="section-title">
            Check your permissions
          </h3>
          <p className="section-copy">
            {copy ?? "All tools are visible. Follow the provider guide for missing access, or open View permissions to inspect the requirements."}
          </p>
        </div>
      </div>
      <div className="permission-readiness-actions">
        {permissionGuideUrl ? (
          <a className="button permission-guide-link" href={permissionGuideUrl} target="_blank" rel="noreferrer">
            {permissionGuideLabel || "Permission guide"}
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        ) : (
          <button
            className="button permission-guide-link"
            type="button"
            disabled
            title="The provider has not added a permission guide."
          >
            Permission guide
            <ExternalLink size={13} aria-hidden="true" />
          </button>
        )}
        <button
          className="button permission-readiness-refresh"
          disabled={isRefreshing}
          type="button"
          onClick={onRefresh}
        >
          <RefreshCw className={isRefreshing ? "spinning" : ""} size={14} aria-hidden="true" />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  )
}

function groupStatus(group: PermissionReadinessGroup): PermissionCheckStatus {
  const statuses = [
    ...group.requirements.map(({ status }) => status),
    ...group.policies.map(({ status }) => status),
  ]
  if (statuses.includes("unavailable")) return "unavailable"
  if (statuses.includes("missing")) return "missing"
  return "ready"
}

function customPermissionRequestStatus(
  group: PermissionReadinessGroup,
): ToolPermissionRequestStatus {
  const checks = [
    ...group.requirements.filter(({ source }) => source !== "managed"),
    ...group.policies.filter(({ source }) => source === "helper"),
  ]
  if (checks.length === 0) return "not-required"
  if (checks.some(({ status }) => status === "unavailable")) return "unavailable"
  if (checks.some(({ status }) => status === "missing")) return "missing"
  return "ready"
}
