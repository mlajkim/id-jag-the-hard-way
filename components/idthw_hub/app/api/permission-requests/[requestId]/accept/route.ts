import { NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import {
  getWorkflowApplication,
  markWorkflowApplicationApproved,
  WorkflowApplicationNotFoundError,
} from "@/features/workflow/api/workflowApplications"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const session = await auth()
  if (!session?.user?.username) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: NO_STORE_HEADERS },
    )
  }

  const { requestId } = await params

  try {
    const application = await getWorkflowApplication(requestId)
    if (application.status === "approved") {
      return NextResponse.json({
        approved: true,
        request: application,
      }, { headers: NO_STORE_HEADERS })
    }

    const approvedRequest = await markWorkflowApplicationApproved(application, session.user.username)

    return NextResponse.json({
      approved: true,
      request: approvedRequest,
    }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to approve workflow application"
    console.error("Unable to approve workflow application", {
      requestId,
      message: message.trim().replace(/\s+/g, " ").slice(0, 300),
    })
    return NextResponse.json(
      { error: error instanceof WorkflowApplicationNotFoundError ? message : "Unable to approve workflow application" },
      {
        status: error instanceof WorkflowApplicationNotFoundError ? 404 : 500,
        headers: NO_STORE_HEADERS,
      },
    )
  }
}
