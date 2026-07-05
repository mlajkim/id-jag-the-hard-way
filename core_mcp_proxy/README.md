# Core MCP Proxy

`core-mcp-proxy` routes stable MCP paths to MCP servers registered in Kubernetes.

```text
/mcp/{id} -> registered MCP server /mcp
```

It discovers MCP deployments in `mcp-hub` using:

```text
app.kubernetes.io/part-of=mcp-hub
mcp.idthw.dev/project=<project-name>
```

For each deployment, it uses `mcp.idthw.dev/upstream-url` when present. Otherwise it infers:

```text
http://<same-name-service>.<namespace>:<service-port>/mcp
```

## Local Image

```sh
make push-local-image-kind
```

This builds `core-mcp-proxy:dev` and loads it into the local Kind cluster.

## Runtime

```sh
npm run check
npm start
```
