import { NextResponse } from "next/server"
import { auth } from "@/features/auth/lib/auth"
import {
  createWorkflowFormTemplate,
  listWorkflowFormTemplates,
  WorkflowFormTemplateConflictError,
} from "@/features/workflow/api/workflowFormTemplates"
import {
  parseNewWorkflowFormTemplate,
  workflowFormTemplateForApplicant,
} from "@/features/workflow/lib/workflowFormTemplate"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

export async function GET() {
  const session = await auth()
  if (!session?.user?.username) {
    return NextResponse.json(
      { templates: [], error: "Authentication required" },
      { status: 401, headers: NO_STORE_HEADERS },
    )
  }

  try {
    return NextResponse.json(
      { templates: (await listWorkflowFormTemplates()).map(workflowFormTemplateForApplicant) },
      { headers: NO_STORE_HEADERS },
    )
  } catch {
    return NextResponse.json(
      { templates: [], error: "Unable to load workflow form templates" },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.username) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: NO_STORE_HEADERS },
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid workflow form template request" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  let input
  try {
    input = parseNewWorkflowFormTemplate(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid workflow form template request" },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const template = await createWorkflowFormTemplate({
      ...input,
      createdBy: session.user.username,
    })
    return NextResponse.json({ template }, { status: 201, headers: NO_STORE_HEADERS })
  } catch (error) {
    if (error instanceof WorkflowFormTemplateConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS },
      )
    }
    console.error("Unable to create workflow form template", {
      createdBy: session.user.username,
      message: error instanceof Error ? error.message.trim().replace(/\s+/g, " ").slice(0, 300) : "Unknown error",
    })
    return NextResponse.json(
      { error: "Unable to create workflow form template" },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
