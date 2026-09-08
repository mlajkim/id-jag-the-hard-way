import type { ReactNode } from "react"
import { AppBar } from "@/components/organisms/AppBar"
import { SideBar } from "@/components/organisms/SideBar"

export function WorkflowConsoleTemplate({ children }: { children: ReactNode }) {
  return (
    <main className="console-shell">
      <AppBar
        accounts={[]}
        serviceMode
        user={{ username: "workflow-platform" }}
      />

      <div className="app-body">
        <SideBar />
        <section className="main-content">{children}</section>
      </div>
    </main>
  )
}
