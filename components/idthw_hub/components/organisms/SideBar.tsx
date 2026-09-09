"use client"

import { BarChart3, ClipboardList, FolderKanban, HelpCircle, LayoutTemplate, ListChecks, Sparkles, Wrench } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  consoleHref,
  displayProduct,
  GENAI_PRODUCT,
  parseConsoleRoute,
  type ConsoleSection,
  WORKFLOW_PRODUCT,
} from "@/components/navigation/consoleRoute"

const NAV_ITEMS: Array<{ section: ConsoleSection; label: string; enabled: boolean }> = [
  { section: "projects", label: "Projects", enabled: true },
  { section: "catalog", label: "Catalog", enabled: true },
  { section: "mcp-server", label: "MCP server", enabled: true },
  { section: "mcp-template", label: "MCP template", enabled: true },
  { section: "playground", label: "Playground", enabled: false },
  { section: "approval", label: "Approval", enabled: false },
]

const GENAI_NAV_ITEMS: Array<{ section: ConsoleSection; label: string; icon: typeof BarChart3 }> = [
  { section: "projects", label: "Projects", icon: FolderKanban },
  { section: "monitoring", label: "Monitoring Dashboard", icon: BarChart3 },
]

const WORKFLOW_NAV_ITEMS: Array<{ section: ConsoleSection; label: string; icon: typeof ListChecks }> = [
  { section: "projects", label: "Projects", icon: FolderKanban },
  { section: "workflow-template", label: "Form templates", icon: LayoutTemplate },
  { section: "requests", label: "Permission requests", icon: ListChecks },
  { section: "demo-tools", label: "Demo tools", icon: Wrench },
]

export function SideBar() {
  const route = parseConsoleRoute(usePathname())
  const isGenAI = route.product === GENAI_PRODUCT
  const isWorkflow = route.product === WORKFLOW_PRODUCT

  return (
    <aside className="sidebar" aria-label={`${displayProduct(route.product)} navigation`}>
      <div className="sidebar-product">
        <Sparkles size={16} aria-hidden="true" />
        {displayProduct(route.product)}
      </div>
      {isGenAI
        ? GENAI_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <Link
                className={`sidebar-link ${route.section === item.section ? "active" : ""}`}
                href={consoleHref({ project: route.project, product: route.product, section: item.section })}
                key={item.section}
              >
                <Icon size={15} aria-hidden="true" />
                {item.label}
              </Link>
            )
          })
        : isWorkflow
          ? WORKFLOW_NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  className={`sidebar-link ${route.section === item.section ? "active" : ""}`}
                  href={consoleHref({ project: route.project, product: route.product, section: item.section })}
                  key={item.section}
                >
                  <Icon size={15} aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })
        : NAV_ITEMS.map((item) => {
            return item.enabled ? (
              <Link
                className={`sidebar-link ${route.section === item.section ? "active" : ""}`}
                href={consoleHref({ project: route.project, product: route.product, section: item.section })}
                key={item.section}
              >
                {item.label}
              </Link>
            ) : (
              <button className={`sidebar-link ${route.section === item.section ? "active" : ""}`} type="button" disabled key={item.section}>
                {item.label}
              </button>
            )
          })}
      <div className="sidebar-divider" />
      <button className="sidebar-support" type="button" disabled>
        <ClipboardList size={14} aria-hidden="true" />
        Document
      </button>
      <button className="sidebar-support" type="button" disabled>
        <HelpCircle size={14} aria-hidden="true" />
        Help channel
      </button>
    </aside>
  )
}
