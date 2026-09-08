import { NextResponse } from "next/server"
import { requestToolPermissionAccess } from "@/features/permissions/api/requestToolPermissionAccess"
import { createZmsRequest } from "@/features/registration/api/mcpManagedAccess"
import {
  getPermissionWorkflowRequest,
  markPermissionWorkflowRequestApproved,
  PermissionWorkflowRequestNotFoundError,
} from "@/features/workflow/api/permissionWorkflowRequests"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params

  try {
    const workflowRequest = await getPermissionWorkflowRequest(requestId)
    if (workflowRequest.status === "approved") {
      return NextResponse.json({
        approved: true,
        checksCompleted: 10,
        request: workflowRequest,
      }, { headers: NO_STORE_HEADERS })
    }

    const report = await requestToolPermissionAccess({
      requirements: workflowRequest.requirements.map((requirement) => ({
        ...requirement,
        status: "missing",
      })),
      policies: workflowRequest.policies.map((policy) => ({
        ...policy,
        status: "missing",
      })),
    }, await createZmsRequest("MCP Hub workflow permission approval"))
    const approvedRequest = await markPermissionWorkflowRequestApproved(workflowRequest, report)

    return NextResponse.json({
      approved: true,
      checksCompleted: 10,
      report,
      request: approvedRequest,
    }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to approve permission request"
    console.error("Unable to approve MCP permission workflow request", {
      requestId,
      message: message.trim().replace(/\s+/g, " ").slice(0, 300),
    })
    return NextResponse.json(
      { error: error instanceof PermissionWorkflowRequestNotFoundError ? message : "Unable to approve permission request" },
      {
        status: error instanceof PermissionWorkflowRequestNotFoundError ? 404 : 500,
        headers: NO_STORE_HEADERS,
      },
    )
  }
}
