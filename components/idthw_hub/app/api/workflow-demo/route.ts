import { NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import {
  grantWorkflowDemoRoles,
  resetWorkflowDemoRoles,
} from "@/features/workflow/api/workflowDemoTools"
import { approveAllPendingWorkflowApplications } from "@/features/workflow/api/workflowApplications"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

export async function POST() {
  const session = await auth()
  if (!session?.user?.username) return authenticationRequired()

  try {
    const roles = await grantWorkflowDemoRoles()
    const applications = await approveAllPendingWorkflowApplications(session.user.username)
    return NextResponse.json({ applicationsApproved: applications.approved, ...roles }, {
      headers: NO_STORE_HEADERS,
    })
  } catch (error) {
    return operationFailed("run Workflow Platform demo approval", error)
  }
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.username) return authenticationRequired()

  try {
    return NextResponse.json(await resetWorkflowDemoRoles(), { headers: NO_STORE_HEADERS })
  } catch (error) {
    return operationFailed("reset Workflow Platform demo roles", error)
  }
}

function authenticationRequired() {
  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401, headers: NO_STORE_HEADERS },
  )
}

function operationFailed(operation: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Demo operation failed"
  console.error(`Unable to ${operation}`, {
    message: message.trim().replace(/\s+/g, " ").slice(0, 300),
  })
  return NextResponse.json(
    { error: message },
    { status: 500, headers: NO_STORE_HEADERS },
  )
}
