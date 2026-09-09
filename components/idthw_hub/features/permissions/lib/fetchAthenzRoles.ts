import "server-only"

import { createZmsRequest } from "@/features/registration/api/mcpManagedAccess"
import { parseSelectableAthenzRoleList } from "./athenzRoles"

export async function fetchSelectableAthenzRoles(domain: string) {
  const requestZms = await createZmsRequest("MCP Hub direct-role selection")
  const response = await requestZms(
    "GET",
    `/domain/${encodeURIComponent(domain)}/role`,
  )
  if (response.status !== 200) throw new Error(`ZMS returned HTTP ${response.status || "unknown"}`)
  return parseSelectableAthenzRoleList(JSON.parse(response.body) as unknown, domain)
}
