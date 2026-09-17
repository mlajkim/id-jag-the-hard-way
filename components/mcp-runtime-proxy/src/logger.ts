export type LogFields = Record<string, unknown>

type LogLevel = "error" | "info" | "warn"

type LoggerOptions = {
  format?: "text" | "json"
  color?: boolean
}

export type RuntimeProxyLogger = {
  error(event: string, fields?: LogFields): void
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
}

export function createRuntimeProxyLogger(
  now: () => Date = () => new Date(),
  options: LoggerOptions = {},
): RuntimeProxyLogger {
  const format = options.format ?? (process.env.LOG_FORMAT === "json" ? "json" : "text")
  return {
    error: (event, fields = {}) => write("error", event, fields, now, format, options.color),
    info: (event, fields = {}) => write("info", event, fields, now, format, options.color),
    warn: (event, fields = {}) => write("warn", event, fields, now, format, options.color),
  }
}

export const runtimeProxyLogger = createRuntimeProxyLogger()

function write(
  level: LogLevel,
  event: string,
  fields: LogFields,
  now: () => Date,
  format: "text" | "json",
  color?: boolean,
) {
  const record = {
    timestamp: now().toISOString(),
    level,
    component: "mcp-runtime-proxy",
    event,
    ...fields,
  }
  const stream = level === "info" ? process.stdout : process.stderr
  const useColor = color ?? (Boolean(stream.isTTY) && process.env.NO_COLOR === undefined)
  const line = format === "json"
    ? JSON.stringify(record)
    : formatText(record.timestamp, level, event, fields, useColor)
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

function formatText(timestamp: string, level: LogLevel, event: string, fields: LogFields, color: boolean) {
  const symbol = eventSymbol(level, event)
  const badge = `${symbol} ${level.toUpperCase().padEnd(5)}`
  const colorCode = level === "error" ? 31 : level === "warn" ? 33 : symbol === "✓" ? 32 : 36
  const label = color ? `\u001b[${colorCode}m${badge}\u001b[0m` : badge
  const details = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${formatValue(key)}=${formatValue(value)}`)
    .join(" ")
  const message = JSON.stringify(event.replaceAll("_", " ")).slice(1, -1)
  return `${timestamp} ${label} [mcp-runtime-proxy] [${eventCategory(event)}] ${message}${details ? ` | ${details}` : ""}`
}

function eventCategory(event: string) {
  if (event.startsWith("server_")) return "server"
  if (event.startsWith("service_identity_")) return "identity"
  if (event.startsWith("mcp_readiness_")) return "health"
  if (event.startsWith("request_")) return "request"
  if (event.startsWith("downstream_")) return "exchange"
  if (event.startsWith("access_") || event.startsWith("public_")) return "auth"
  if (event.startsWith("upstream_")) return "upstream"
  return "runtime"
}

function eventSymbol(level: LogLevel, event: string) {
  if (level === "error") return "×"
  if (level === "warn") return "!"
  if (event === "request_received") return "→"
  if (/(?:_started|_ready|_refreshed|_verified|_allowed|_published|_completed)$/.test(event)) return "✓"
  return "·"
}

function formatValue(value: unknown) {
  if (typeof value === "string" && /^[\w./:@+-]+$/.test(value)) return value
  return JSON.stringify(value)
}
