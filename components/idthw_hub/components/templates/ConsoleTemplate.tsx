import type { ReactNode } from "react"
import { AppBar } from "@/components/organisms/AppBar"
import { SideBar } from "@/components/organisms/SideBar"
import { requireHubSession } from "@/features/auth/lib/session"
import { fetchProjectNamespaces } from "@/features/projects/api/projectNamespaces"

export async function ConsoleTemplate({ children }: { children: ReactNode }) {
  const [session, projectResponse] = await Promise.all([
    requireHubSession(),
    fetchProjectNamespaces(),
  ])

  return (
    <main className="console-shell">
      <AppBar user={{
        name: session.user.name,
        email: session.user.email,
        username: session.user.username,
        subject: session.user.subject,
      }} accounts={session.accounts} projects={projectResponse.projects} />

      <div className="app-body">
        <SideBar />

        <section className="main-content">{children}</section>
      </div>
    </main>
  )
}
