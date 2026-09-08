import type { ReactNode } from "react"
import { AppBar } from "@/components/organisms/AppBar"
import { SideBar } from "@/components/organisms/SideBar"
import { fetchProjectNamespaces } from "@/features/projects/api/projectNamespaces"

export async function WorkflowConsoleTemplate({ children }: { children: ReactNode }) {
  const projectResponse = await fetchProjectNamespaces()

  return (
    <main className="console-shell">
      <AppBar
        accounts={[]}
        projects={projectResponse.projects}
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
