"use client"

import { Clock3, KeyRound, RefreshCw, ShieldCheck, Users } from "lucide-react"
import { useEffect, useState } from "react"
import type { McpGatewayCacheStatus } from "@/features/catalog/lib/mcpGatewayCacheStatus"

type AvailableGatewayStatus = Extract<McpGatewayCacheStatus, { available: true }>
type GatewaySession = AvailableGatewayStatus["sessions"][number]
type CacheCollection = GatewaySession["athenzAccessTokens"]
type CacheEntry = CacheCollection["entries"][number]
type LiveStatus = "valid" | "refresh-required" | "expired"

export function McpGatewayCacheDashboard({
  initialStatus,
}: {
  initialStatus: McpGatewayCacheStatus
}) {
  const [status, setStatus] = useState(initialStatus)
  const [nowMs, setNowMs] = useState(() => parsedTime(initialStatus.generatedAt) ?? 0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState("")

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  async function refresh() {
    setIsRefreshing(true)
    setRefreshError("")
    try {
      const response = await fetch("/api/mcp-cache-status", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
      const payload = await response.json() as {
        error?: unknown
        gatewayOAuthSessions?: McpGatewayCacheStatus
      }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : `Refresh failed (${response.status})`)
      }
      if (!payload.gatewayOAuthSessions) throw new Error("The cache-status response is incomplete")
      setStatus(payload.gatewayOAuthSessions)
      setNowMs(Date.now())
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Unable to refresh MCP Gateway cache status")
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <section className="gateway-cache-dashboard" aria-label="MCP Gateway cache status">
      <div className="gateway-cache-toolbar">
        <div className="gateway-cache-snapshot">
          <Clock3 size={15} aria-hidden="true" />
          <span>Snapshot</span>
          <strong>{formatTimestamp(status.generatedAt)}</strong>
        </div>
        <button
          className="button gateway-cache-refresh"
          type="button"
          disabled={isRefreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw className={isRefreshing ? "spinning" : undefined} size={14} aria-hidden="true" />
          {isRefreshing ? "Refreshing..." : "Refresh cache"}
        </button>
      </div>

      {refreshError ? <p className="catalog-error gateway-cache-error" role="status">{refreshError}</p> : null}

      {!status.available ? (
        <div className="gateway-cache-unavailable" role="status">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>Gateway cache status is unavailable</strong>
            <p>{status.error}</p>
          </div>
        </div>
      ) : (
        <AvailableCacheDashboard status={status} nowMs={nowMs} />
      )}
    </section>
  )
}

function AvailableCacheDashboard({ status, nowMs }: { status: AvailableGatewayStatus; nowMs: number }) {
  const userCount = new Set(status.sessions.map((session) => session.username)).size
  const accessTokenCount = status.sessions.reduce(
    (total, session) => total + session.athenzAccessTokens.entryCount,
    0,
  )
  const idJagCount = status.sessions.reduce(
    (total, session) => total + session.athenzIdJags.entryCount,
    0,
  )

  return (
    <>
      <div className="gateway-cache-metrics" aria-label="Cache summary">
        <CacheMetric icon={<Users size={17} />} label="Active users" value={userCount} />
        <CacheMetric icon={<ShieldCheck size={17} />} label="Gateway sessions" value={status.sessionCount} />
        <CacheMetric icon={<KeyRound size={17} />} label="Access-token entries" value={accessTokenCount} />
        <CacheMetric icon={<Clock3 size={17} />} label="ID-JAG entries" value={idJagCount} />
      </div>

      <div className="gateway-cache-privacy-note">
        Credential values are never exposed. This view contains only user identifiers, identity and session expiry, audiences, scopes, and cache metadata.
      </div>

      {status.sessions.length === 0 ? (
        <div className="gateway-cache-empty">
          <Users size={22} aria-hidden="true" />
          <strong>No active MCP Gateway sessions</strong>
          <span>Connect an MCP client and call a protected tool, then refresh this page.</span>
        </div>
      ) : (
        <div className="gateway-cache-session-list">
          {status.sessions.map((session, index) => (
            <GatewaySessionCard
              key={`${session.subject}-${session.expiresAt}-${index}`}
              session={session}
              sessionSkewSeconds={status.expirySkewSeconds}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CacheMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="gateway-cache-metric">
      <span className="gateway-cache-metric-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function GatewaySessionCard({
  session,
  sessionSkewSeconds,
  nowMs,
}: {
  session: GatewaySession
  sessionSkewSeconds: number
  nowMs: number
}) {
  const sessionStatus = liveStatus(session.expiresAt, sessionSkewSeconds, nowMs, session.status)
  const idTokenStatus = liveStatus(session.idTokenExpiresAt, sessionSkewSeconds, nowMs, "valid")

  return (
    <article className="gateway-cache-session">
      <header className="gateway-cache-session-head">
        <div className="gateway-cache-user">
          <span className="gateway-cache-user-avatar" aria-hidden="true">{userInitials(session.username)}</span>
          <div>
            <strong>{session.username}</strong>
            <code>{session.subject}</code>
          </div>
        </div>
        <div className="gateway-cache-session-expiry">
          <div className="gateway-cache-session-deadline">
            <StatusPill status={idTokenStatus} />
            <div>
              <span>ID token</span>
              <strong>{remainingTime(session.idTokenExpiresAt, nowMs)}</strong>
              <small>{formatTimestamp(session.idTokenExpiresAt)}</small>
            </div>
          </div>
          <div className="gateway-cache-session-deadline">
            <StatusPill status={sessionStatus} />
            <div>
              <span>Gateway session</span>
              <strong>{remainingTime(session.expiresAt, nowMs)}</strong>
              <small>{formatTimestamp(session.expiresAt)}</small>
            </div>
          </div>
        </div>
      </header>

      <div className="gateway-cache-token-grid">
        <TokenCachePanel
          cache={session.athenzAccessTokens}
          icon={<KeyRound size={15} />}
          title="Athenz access tokens"
          emptyMessage="No access token has been cached for this session."
          nowMs={nowMs}
        />
        <TokenCachePanel
          cache={session.athenzIdJags}
          icon={<ShieldCheck size={15} />}
          title="ID-JAG assertions"
          emptyMessage="No ID-JAG has been cached for this session."
          nowMs={nowMs}
        />
      </div>
    </article>
  )
}

function TokenCachePanel({
  cache,
  icon,
  title,
  emptyMessage,
  nowMs,
}: {
  cache: CacheCollection
  icon: React.ReactNode
  title: string
  emptyMessage: string
  nowMs: number
}) {
  return (
    <section className="gateway-cache-token-panel">
      <div className="gateway-cache-token-head">
        <div>
          <span aria-hidden="true">{icon}</span>
          <h3>{title}</h3>
        </div>
        <span className="gateway-cache-entry-count">{cache.entryCount}</span>
      </div>

      {cache.entries.length === 0 ? (
        <p className="gateway-cache-token-empty">{emptyMessage}</p>
      ) : (
        <div className="gateway-cache-token-table-wrap">
          <table className="gateway-cache-token-table">
            <thead>
              <tr>
                <th>Audience and scope</th>
                <th>Cached</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cache.entries.map((entry, index) => (
                <CacheEntryRow
                  entry={entry}
                  expirySkewSeconds={cache.expirySkewSeconds}
                  key={`${entry.audiences.join(" ")}-${entry.scope}-${entry.cachedAt}-${index}`}
                  nowMs={nowMs}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CacheEntryRow({
  entry,
  expirySkewSeconds,
  nowMs,
}: {
  entry: CacheEntry
  expirySkewSeconds: number
  nowMs: number
}) {
  const status = liveStatus(entry.expiresAt, expirySkewSeconds, nowMs, entry.status)
  const scopes = entry.scope.split(/\s+/).filter(Boolean)

  return (
    <tr>
      <td>
        <div className="gateway-cache-claims">
          <div className="gateway-cache-audiences">
            {entry.audiences.map((audience) => <code key={audience}>{audience}</code>)}
          </div>
          <div className="gateway-cache-scopes">
            {scopes.map((scope) => <code key={scope}>{scope}</code>)}
          </div>
        </div>
      </td>
      <td className="gateway-cache-time-cell">{formatTimestamp(entry.cachedAt)}</td>
      <td className="gateway-cache-expiry-cell">
        <strong data-status={status}>{remainingTime(entry.expiresAt, nowMs)}</strong>
        <small>{formatTimestamp(entry.expiresAt)}</small>
      </td>
      <td><StatusPill status={status} /></td>
    </tr>
  )
}

function StatusPill({ status }: { status: LiveStatus }) {
  return (
    <span className="gateway-cache-status" data-status={status}>
      <span aria-hidden="true" />
      {status === "valid" ? "Valid" : status === "refresh-required" ? "Refresh soon" : "Expired"}
    </span>
  )
}

function liveStatus(
  expiresAt: string,
  skewSeconds: number,
  nowMs: number,
  fallback: "valid" | "refresh-required" | "expired",
): LiveStatus {
  const expiryMs = parsedTime(expiresAt)
  if (expiryMs === undefined) return fallback
  if (expiryMs <= nowMs) return "expired"
  return expiryMs <= nowMs + skewSeconds * 1000 ? "refresh-required" : "valid"
}

function remainingTime(expiresAt: string, nowMs: number) {
  const expiryMs = parsedTime(expiresAt)
  if (expiryMs === undefined) return "Unknown"
  const remainingSeconds = Math.max(0, Math.ceil((expiryMs - nowMs) / 1000))
  if (remainingSeconds === 0) return "Expired"

  const days = Math.floor(remainingSeconds / 86_400)
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600)
  const minutes = Math.floor((remainingSeconds % 3_600) / 60)
  const seconds = remainingSeconds % 60
  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
  return days > 0 ? `${days}d ${clock}` : clock
}

function formatTimestamp(value: string) {
  const timestamp = parsedTime(value)
  if (timestamp === undefined) return "Unknown"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(timestamp).replace(",", "") + " JST"
}

function parsedTime(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function userInitials(username: string) {
  return username
    .split(/[._-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U"
}
