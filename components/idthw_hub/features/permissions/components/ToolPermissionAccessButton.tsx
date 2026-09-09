import { CheckCircle2, ExternalLink } from "lucide-react"

export type ToolPermissionRequestStatus =
  | "missing"
  | "not-required"
  | "ready"
  | "unavailable"
  | "unconfigured"

export function ToolPermissionAccessButton({
  permissionGuideUrl,
  status,
  toolName,
}: {
  permissionGuideUrl?: string
  status: ToolPermissionRequestStatus
  toolName: string
}) {
  const label = status === "ready"
    ? "Permission granted"
    : status === "not-required"
      ? "No request needed"
      : "How to request permission"
  const needsGuide = status !== "ready" && status !== "not-required"

  return (
    <div className="tool-permission-request-control">
      {needsGuide && permissionGuideUrl ? (
        <a
          aria-label={`${label} for ${toolName}`}
          className="button tool-permission-request-button"
          data-state="guide"
          href={permissionGuideUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} aria-hidden="true" />
          {label}
        </a>
      ) : (
        <button
          aria-label={`${label} for ${toolName}`}
          className="button tool-permission-request-button"
          data-state={status === "ready" ? "approved" : "idle"}
          disabled
          title={needsGuide ? "The provider has not added a permission guide." : undefined}
          type="button"
        >
          {status === "ready"
            ? <CheckCircle2 size={13} aria-hidden="true" />
            : needsGuide ? <ExternalLink size={13} aria-hidden="true" /> : null}
          {label}
        </button>
      )}
    </div>
  )
}
