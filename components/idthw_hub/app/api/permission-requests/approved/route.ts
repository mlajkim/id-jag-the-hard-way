import { NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import { deleteApprovedPermissionWorkflowRequests } from "@/features/workflow/api/permissionWorkflowRequests"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.username) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const report = await deleteApprovedPermissionWorkflowRequests()
    return NextResponse.json(report, { headers: NO_STORE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete approved requests"
    console.error("Unable to delete approved MCP permission workflow requests", {
      message: message.trim().replace(/\s+/g, " ").slice(0, 300),
    })
    return NextResponse.json(
      { error: "Unable to delete approved requests" },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
