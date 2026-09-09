import { NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import {
  deleteWorkflowFormTemplate,
  getWorkflowFormTemplate,
  updateWorkflowFormTemplate,
  WorkflowFormTemplateNotFoundError,
  WorkflowFormTemplateVersionConflictError,
} from "@/features/workflow/api/workflowFormTemplates"
import {
  parseWorkflowFormTemplateUpdate,
  workflowFormTemplateForApplicant,
} from "@/features/workflow/lib/workflowFormTemplate"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

export async function GET(
  _request: Request,
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
  try {
    return NextResponse.json(
      { template: workflowFormTemplateForApplicant(await getWorkflowFormTemplate(templateId)) },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    if (error instanceof WorkflowFormTemplateNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: NO_STORE_HEADERS },
      )
    }
    return NextResponse.json(
      { error: "Unable to load workflow form template" },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}

export async function PUT(
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
      { error: "Invalid workflow form template update request" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  let input
  try {
    input = parseWorkflowFormTemplateUpdate(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid workflow form template update request" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const template = await updateWorkflowFormTemplate(templateId, input)
    return NextResponse.json({ template }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    if (error instanceof WorkflowFormTemplateNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: NO_STORE_HEADERS },
      )
    }
    if (error instanceof WorkflowFormTemplateVersionConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS },
      )
    }
    console.error("Unable to update workflow form template", {
      templateId,
      username: session.user.username,
      message: error instanceof Error ? error.message.trim().replace(/\s+/g, " ").slice(0, 300) : "Unknown error",
    })
    return NextResponse.json(
      { error: "Unable to update workflow form template" },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}

export async function DELETE(
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
      { error: "Invalid workflow form template deletion request" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }
  if (deleteConfirmation(payload) !== templateId) {
    return NextResponse.json(
      { error: "Template ID confirmation does not match" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  try {
    await deleteWorkflowFormTemplate(templateId)
    return NextResponse.json({ deleted: { id: templateId } }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    if (error instanceof WorkflowFormTemplateNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: NO_STORE_HEADERS },
      )
    }
    console.error("Unable to delete workflow form template", {
      templateId,
      username: session.user.username,
      message: error instanceof Error ? error.message.trim().replace(/\s+/g, " ").slice(0, 300) : "Unknown error",
    })
    return NextResponse.json(
      { error: "Unable to delete workflow form template" },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}

function deleteConfirmation(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ""
  const confirmation = (payload as Record<string, unknown>).confirmation
  return typeof confirmation === "string" ? confirmation : ""
}
