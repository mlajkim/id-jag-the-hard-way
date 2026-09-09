import { NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import {
  deleteWorkflowFormTemplate,
  WorkflowFormTemplateNotFoundError,
} from "@/features/workflow/api/workflowFormTemplates"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

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
