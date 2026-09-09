const ATHENZ_ROLE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function parseSelectableAthenzRoleList(value: unknown, domain: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ZMS returned an invalid role list")
  }
  const names = (value as Record<string, unknown>).names
  if (!Array.isArray(names)) throw new Error("ZMS returned an invalid role list")

  const roles = names.map((value) => {
    if (typeof value !== "string") throw new Error("ZMS returned an invalid role name")
    const prefix = `${domain}:role.`
    const role = value.startsWith(prefix) ? value.slice(prefix.length) : value
    if (!ATHENZ_ROLE_NAME_PATTERN.test(role)) {
      throw new Error("ZMS returned an invalid role name")
    }
    return role
  })

  return [...new Set(roles.filter(isSelectableAthenzDirectRole))].sort((left, right) => (
    left.localeCompare(right)
  ))
}

export function isSelectableAthenzDirectRole(role: string) {
  const normalized = role.toLowerCase()
  return normalized !== "admin"
    && normalized !== "zts_instance_launch_provider"
    && !normalized.endsWith("-exchanger")
}
