import { NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import { createWorkflowApplication } from "@/features/workflow/api/workflowApplications"
import { WorkflowApplicationTemplateVersionConflictError } from "@/features/workflow/lib/workflowApplication"
import {
  getWorkflowFormTemplate,
  WorkflowFormTemplateNotFoundError,
} from "@/features/workflow/api/workflowFormTemplates"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const session = await auth()
  if (!session?.user?.username) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: NO_STORE_HEADERS },
    )
  }

  const { templateId } = await params
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid workflow application" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const template = await getWorkflowFormTemplate(templateId)
    const application = await createWorkflowApplication(
      template,
      payload,
      session.user.username,
    )
    return NextResponse.json(
      { application: { id: application.id, templateVersion: application.templateVersion } },
      { status: 201, headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    if (error instanceof WorkflowFormTemplateNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: NO_STORE_HEADERS },
      )
    }
    if (error instanceof WorkflowApplicationTemplateVersionConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS },
      )
    }
    const message = error instanceof Error ? error.message : "Unable to submit workflow application"
    const validationError = /required|answer|unknown field|must be an object/i.test(message)
    if (!validationError) {
      console.error("Unable to submit workflow application", {
        templateId,
        username: session.user.username,
        message: message.trim().replace(/\s+/g, " ").slice(0, 300),
      })
    }
    return NextResponse.json(
      { error: validationError ? message : "Unable to submit workflow application" },
      { status: validationError ? 400 : 500, headers: NO_STORE_HEADERS },
    )
  }
}
