export type ProjectNamespace = {
  createdAt?: string
  name: string
  status: string
}

export type ProjectNamespaceResult = {
  error?: string
  projects: ProjectNamespace[]
}
