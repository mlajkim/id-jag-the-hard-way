"use client"

import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { SelectMenu } from "@/components/atoms/SelectMenu"
import { isSelectableAthenzDirectRole } from "@/features/permissions/lib/athenzRoles"

const ATHENZ_DOMAIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,251}[A-Za-z0-9])?$/

type RoleOptionsState = {
  audience: string
  roles: string[]
  status: "error" | "idle" | "loading" | "ready"
}

export function AthenzRoleSelect({
  audience,
  disabled = false,
  onChange,
  value,
}: {
  audience: string
  disabled?: boolean
  onChange: (role: string) => void
  value: string
}) {
  const normalizedAudience = audience.trim()
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)
  const requestRef = useRef<AbortController | null>(null)
  const initialLookupRef = useRef("")
  const [state, setState] = useState<RoleOptionsState>({
    audience: "",
    roles: [],
    status: "idle",
  })

  useEffect(() => {
    onChangeRef.current = onChange
    valueRef.current = value
  }, [onChange, value])

  useEffect(() => () => requestRef.current?.abort(), [])

  const loadRoles = useCallback(async (force = false) => {
    if (disabled || !ATHENZ_DOMAIN_PATTERN.test(normalizedAudience)) return
    if (!force
      && state.audience === normalizedAudience
      && (state.status === "loading" || state.status === "ready")) return

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setState((current) => ({
      audience: normalizedAudience,
      roles: current.audience === normalizedAudience ? current.roles : [],
      status: "loading",
    }))
    try {
      const response = await fetch(
        `/api/athenz/roles?domain=${encodeURIComponent(normalizedAudience)}`,
        { cache: "no-store", signal: controller.signal },
      )
      const payload = await response.json() as { roles?: unknown }
      if (!response.ok || !Array.isArray(payload.roles) || payload.roles.some((role) => (
        typeof role !== "string" || !isSelectableAthenzDirectRole(role)
      ))) {
        throw new Error("Unable to load roles")
      }
      const roles = payload.roles as string[]
      setState({ audience: normalizedAudience, roles, status: "ready" })
      if (valueRef.current && !roles.includes(valueRef.current)) onChangeRef.current("")
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      setState({ audience: normalizedAudience, roles: [], status: "error" })
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }, [disabled, normalizedAudience, state.audience, state.status])

  useEffect(() => {
    if (disabled || !value || !ATHENZ_DOMAIN_PATTERN.test(normalizedAudience)) return
    const lookupKey = `${normalizedAudience}:${value}`
    if (initialLookupRef.current === lookupKey) return
    initialLookupRef.current = lookupKey
    void loadRoles()
  }, [disabled, loadRoles, normalizedAudience, value])

  const currentState = state.audience === normalizedAudience ? state : {
    audience: normalizedAudience,
    roles: [],
    status: "idle" as const,
  }
  const roles = currentState.status !== "ready" && value
    ? [value, ...currentState.roles.filter((role) => role !== value)]
    : currentState.roles
  const options = roles.map((role) => ({ label: role, value: role }))
  const placeholder = disabled
    ? "Not required"
    : !normalizedAudience
      ? "Enter an audience first"
      : !ATHENZ_DOMAIN_PATTERN.test(normalizedAudience)
        ? "Enter a valid audience"
        : currentState.status === "loading"
          ? "Loading roles..."
          : currentState.status === "error"
            ? "Unable to load roles"
            : options.length === 0 && currentState.status === "ready"
              ? "No selectable roles"
              : "Select a role"

  return (
    <>
      <div className="athenz-role-select-control">
        <SelectMenu
          ariaLabel="Required role"
          disabled={disabled || !ATHENZ_DOMAIN_PATTERN.test(normalizedAudience)}
          onChange={onChange}
          onOpen={() => void loadRoles()}
          options={options}
          placeholder={placeholder}
          value={value}
        />
        <button
          aria-label={`Refresh roles for ${normalizedAudience || "audience"}`}
          className="athenz-role-select-refresh"
          disabled={disabled
            || !ATHENZ_DOMAIN_PATTERN.test(normalizedAudience)
            || currentState.status === "loading"}
          title="Refresh roles"
          type="button"
          onClick={() => void loadRoles(true)}
        >
          <RefreshCw
            className={currentState.status === "loading" ? "spinning" : undefined}
            size={13}
            aria-hidden="true"
          />
        </button>
      </div>
      {currentState.status === "error" ? (
        <small className="athenz-role-select-status" role="alert">
          Could not load roles for this audience.
        </small>
      ) : null}
    </>
  )
}
