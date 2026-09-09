import type { ReactNode } from "react"
import { ConsoleTemplate } from "@/components/templates/ConsoleTemplate"

export async function WorkflowConsoleTemplate({ children }: { children: ReactNode }) {
  return <ConsoleTemplate>{children}</ConsoleTemplate>
}
