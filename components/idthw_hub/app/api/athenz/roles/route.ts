import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import { fetchSelectableAthenzRoles } from "@/features/permissions/lib/fetchAthenzRoles"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
}
const ATHENZ_DOMAIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,251}[A-Za-z0-9])?$/

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: NO_STORE_HEADERS },
    )
  }

  const domain = request.nextUrl.searchParams.get("domain")?.trim() ?? ""
  if (!ATHENZ_DOMAIN_PATTERN.test(domain)) {
    return NextResponse.json(
      { error: "Invalid Athenz domain" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const roles = await fetchSelectableAthenzRoles(domain)
    return NextResponse.json({ domain, roles }, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json(
      { error: "Unable to load Athenz roles" },
      { status: 502, headers: NO_STORE_HEADERS },
    )
  }
}
