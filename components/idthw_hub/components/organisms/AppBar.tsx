"use client"

import { ArrowUpRight, Bell, Boxes, BrainCircuit, Check, ChevronDown, FolderKanban, Grip, ListChecks, LogIn, LogOut, Sparkles, TerminalSquare } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import {
  DEFAULT_PRODUCT,
  consoleHref,
  displayProduct,
  GENAI_PRODUCT,
  parseConsoleRoute,
  productHref,
  WORKFLOW_PRODUCT,
} from "@/components/navigation/consoleRoute"
import { signInAsDifferentUser, signOutFromIdp, switchIdpUser } from "@/features/auth/actions/idp"
import type { HubAccountSummary } from "@/features/auth/types/accounts"
import type { ProjectNamespace } from "@/features/projects/types"

const PRODUCTS = [
  {
    id: DEFAULT_PRODUCT,
    label: "MCP hub",
    description: "Discover servers, tools, and connection details.",
    icon: Boxes,
    accent: "mcp",
  },
  {
    id: GENAI_PRODUCT,
    label: "Gen AI",
    description: "Monitor model usage, cost, and access.",
    icon: BrainCircuit,
    accent: "genai",
  },
  {
    id: WORKFLOW_PRODUCT,
    label: "Workflow Platform",
    description: "Create reusable application forms and review requests.",
    icon: ListChecks,
    accent: "workflow",
  },
]

type AppBarUser = {
  name?: string | null
  email?: string | null
  username: string
  subject?: string
}

function initials(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U"
}

export function AppBar({
  accounts,
  projects,
  serviceMode = false,
  user,
}: {
  accounts: HubAccountSummary[]
  projects: ProjectNamespace[]
  serviceMode?: boolean
  user: AppBarUser
}) {
  const pathname = usePathname()
  const route = parseConsoleRoute(pathname)
  const projectSwitcher = useRef<HTMLDetailsElement>(null)
  const productSwitcher = useRef<HTMLDetailsElement>(null)
  const userMenu = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (projectSwitcher.current?.open && !projectSwitcher.current.contains(event.target as Node)) {
        projectSwitcher.current.removeAttribute("open")
      }
      if (productSwitcher.current?.open && !productSwitcher.current.contains(event.target as Node)) {
        productSwitcher.current.removeAttribute("open")
      }
      if (userMenu.current?.open && !userMenu.current.contains(event.target as Node)) {
        userMenu.current.removeAttribute("open")
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        projectSwitcher.current?.removeAttribute("open")
        productSwitcher.current?.removeAttribute("open")
        userMenu.current?.removeAttribute("open")
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [])

  return (
    <header className="top-header">
      <div className="header-left">
        <div className="logo-mark" aria-label="IDTHW">
          <Image src="/icons/cloud.png" alt="" width={28} height={28} className="brand-logo-image" />
          <span className="logo-text">IDTHW</span>
        </div>
        <button className="env-select" type="button" disabled>
          <span className="select-name">Dev</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        <details className="project-switcher" ref={projectSwitcher}>
          <summary className="context-select project-select">
            <span className="select-type">Project (K8s namespace)</span>
            <span className="select-name">
              {route.project}
              <ChevronDown size={12} aria-hidden="true" />
            </span>
          </summary>
          <div className="project-switcher-menu">
            <div className="project-switcher-heading">
              <span>Projects</span>
              <strong>Select a namespace</strong>
              <small>Switch the current {displayProduct(route.product)} workspace.</small>
            </div>
            <div className="project-switcher-list">
              {projects.length > 0 ? projects.map((project) => {
                const active = route.project === project.name
                const available = project.status === "Active"
                const content = (
                  <>
                    <span className="project-switcher-icon"><FolderKanban size={15} aria-hidden="true" /></span>
                    <span className="project-switcher-copy">
                      <strong>{project.name}</strong>
                      <small>{available ? "Active namespace" : project.status}</small>
                    </span>
                    {active ? <Check size={15} aria-label="Current project" /> : null}
                  </>
                )
                return available ? (
                  <Link
                    className={`project-switcher-option ${active ? "active" : ""}`}
                    href={productHref(project.name, route.product)}
                    key={project.name}
                    onClick={() => projectSwitcher.current?.removeAttribute("open")}
                  >
                    {content}
                  </Link>
                ) : (
                  <span className="project-switcher-option unavailable" key={project.name} aria-disabled="true">
                    {content}
                  </span>
                )
              }) : (
                <span className="project-switcher-empty">No project namespaces found.</span>
              )}
            </div>
            <Link
              className="project-switcher-footer"
              href={consoleHref({ project: route.project, product: route.product, section: "projects" })}
              onClick={() => projectSwitcher.current?.removeAttribute("open")}
            >
              <FolderKanban size={14} aria-hidden="true" />
              View all projects
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </details>
        <details className="product-switcher" ref={productSwitcher}>
          <summary className="context-select product-select">
            <span className="select-type">Product</span>
            <span className="select-name">
              {displayProduct(route.product)}
              <ChevronDown size={12} aria-hidden="true" />
            </span>
          </summary>
          <div className="product-switcher-menu">
            <div className="product-switcher-heading">
              <span className="product-switcher-kicker">Product console</span>
              <strong>Choose an application</strong>
              <small>Move between IDTHW product workspaces.</small>
            </div>
            <div className="product-switcher-grid">
              {PRODUCTS.map((product) => {
                const Icon = product.icon
                const active = route.product === product.id
                return (
                  <Link
                    className={`product-switcher-card ${product.accent} ${active ? "active" : ""}`}
                    href={productHref(route.project, product.id)}
                    key={product.id}
                    onClick={() => productSwitcher.current?.removeAttribute("open")}
                  >
                    <span className="product-card-icon"><Icon size={21} aria-hidden="true" /></span>
                    <span className="product-card-copy">
                      <span className="product-card-title">
                        <strong>{product.label}</strong>
                        {active ? <small className="current-product-badge">Current</small> : <ArrowUpRight size={14} aria-hidden="true" />}
                      </span>
                      <small>{product.description}</small>
                    </span>
                  </Link>
                )
              })}
            </div>
            <div className="product-switcher-footer">
              <Sparkles size={13} aria-hidden="true" />
              Three products, one local IDTHW workspace
            </div>
          </div>
        </details>
      </div>

      <div className="header-right">
        <button className="region-select" type="button" disabled>
          <span className="select-type">Region</span>
          <span className="select-name">local</span>
        </button>
        <button className="icon-button" aria-label="AI assistant" type="button" disabled>
          <Sparkles size={16} aria-hidden="true" />
        </button>
        <button className="icon-button" aria-label="Cloud shell" type="button" disabled>
          <TerminalSquare size={16} aria-hidden="true" />
        </button>
        <button className="icon-button" aria-label="Notifications" type="button" disabled>
          <Bell size={16} aria-hidden="true" />
        </button>
        {serviceMode ? (
          <div className="current-user workflow-open-mode" aria-label="Open workflow access">
            <div className="avatar" aria-hidden="true">WF</div>
            <span>Open workflow access</span>
          </div>
        ) : <details className="user-menu" ref={userMenu}>
          <summary className="current-user" aria-label={`Current user ${user.username}`}>
            <div className="avatar" aria-hidden="true">{initials(user.username)}</div>
            <span>{user.username}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </summary>
          <div className="user-menu-panel">
            <div className="user-menu-heading">
              <small>Signed-in users</small>
              <span>Select an account to switch instantly.</span>
            </div>
            <div className="user-account-list">
              {accounts.map((account) => {
                const active = account.subject === user.subject
                return (
                  <form action={switchIdpUser} key={account.subject}>
                    <input name="subject" type="hidden" value={account.subject} />
                    <input name="returnTo" type="hidden" value={pathname} />
                    <button className={`user-account-option ${active ? "active" : ""}`} type="submit" disabled={active}>
                      <span className="avatar" aria-hidden="true">{initials(account.username)}</span>
                      <span className="user-account-copy">
                        <strong>{account.username}</strong>
                        {account.email ? <small>{account.email}</small> : null}
                      </span>
                      {active ? <Check size={15} aria-label="Current user" /> : null}
                    </button>
                  </form>
                )
              })}
            </div>
            <div className="user-menu-actions">
              <form action={signInAsDifferentUser}>
                <button type="submit">
                  <LogIn size={14} aria-hidden="true" />
                  Sign in as a different user
                </button>
              </form>
              <form action={signOutFromIdp}>
                <button className="danger" type="submit">
                  <LogOut size={14} aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </details>}
        <button className="icon-button" aria-label="App menu" type="button" disabled>
          <Grip size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
