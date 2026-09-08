"use client"

import { CheckCircle2, KeyRound } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { SelectMenu } from "@/components/atoms/SelectMenu"
import { emptyEditablePermissionRequirement } from "@/features/permissions/lib/toolPermissionDraft"
import type { EditablePermissionRequirement } from "@/features/permissions/types/permissions"

export function AdditionalToolAccessField({
  requirements,
  setRequirements,
}: {
  requirements: EditablePermissionRequirement[]
  setRequirements: Dispatch<SetStateAction<EditablePermissionRequirement[]>>
}) {
  const accessMode = requirements.length === 0 ? "none" : "required"
  const changeAccessMode = (value: string) => {
    if (value === "none") {
      setRequirements([])
      return
    }
    setRequirements((current) => (
      current.length > 0 ? current : [emptyEditablePermissionRequirement()]
    ))
  }

  const options = [
    { value: "required", label: "Additional permission required" },
    { value: "none", label: "No additional permission required" },
  ]

  return (
    <div className="additional-tool-access" data-mode={accessMode}>
      <div className="permission-editor-field">
        <span>Additional tool access</span>
        <SelectMenu
          ariaLabel="Additional tool access"
          value={accessMode}
          options={options}
          onChange={changeAccessMode}
        />
      </div>
      <p className="additional-tool-access-copy">
        {accessMode === "none" ? (
          <>
            <CheckCircle2 size={16} aria-hidden="true" />
            <span><strong>No additional permission required.</strong> Standard MCP server access still applies.</span>
          </>
        ) : (
          <>
            <KeyRound size={16} aria-hidden="true" />
            <span>Define the downstream access required to use this tool.</span>
          </>
        )}
      </p>
    </div>
  )
}
