import { cache } from "react"
import {
  kubectlArgs,
  runKubectlCommand,
  type KubectlRunner,
} from "../../kubernetes/api/kubectl.ts"
import { isProjectNamespaceName } from "../lib/projectNamespace.ts"
import type { ProjectNamespace, ProjectNamespaceResult } from "../types.ts"

type KubernetesNamespaceList = {
  items?: Array<{
    metadata?: {
      creationTimestamp?: unknown
      name?: unknown
    }
    status?: {
      phase?: unknown
    }
  }>
}

export async function listProjectNamespaces(
  runKubectl: KubectlRunner = runKubectlCommand,
): Promise<ProjectNamespace[]> {
  const response = await runKubectl(kubectlArgs([
    "get",
    "namespaces",
    "-o",
    "json",
  ]))
  const payload = JSON.parse(response.stdout) as KubernetesNamespaceList

  return (payload.items ?? [])
    .flatMap((namespace): ProjectNamespace[] => {
      const name = typeof namespace.metadata?.name === "string"
        ? namespace.metadata.name
        : ""
      if (!isProjectNamespaceName(name)) return []

      const createdAt = typeof namespace.metadata?.creationTimestamp === "string"
        && Number.isFinite(Date.parse(namespace.metadata.creationTimestamp))
        ? namespace.metadata.creationTimestamp
        : undefined
      const status = typeof namespace.status?.phase === "string" && namespace.status.phase.trim()
        ? namespace.status.phase.trim()
        : "Unknown"
      return [{ ...(createdAt ? { createdAt } : {}), name, status }]
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

export const fetchProjectNamespaces = cache(async (): Promise<ProjectNamespaceResult> => {
  try {
    return { projects: await listProjectNamespaces() }
  } catch (error) {
    console.error("Unable to list Kubernetes project namespaces", {
      message: error instanceof Error
        ? error.message.trim().replace(/\s+/g, " ").slice(0, 300)
        : "Unknown Kubernetes error",
    })
    return {
      error: "Projects could not be loaded from Kubernetes.",
      projects: [],
    }
  }
})
