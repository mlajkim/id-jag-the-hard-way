@./CLAUDE.md

# Repository Instructions

`CLAUDE.md` contains general repository guidance. The tutorial rules below record the intended teaching style and component responsibilities.

## Tutorial Changes

- One code block or script should do one understandable job. Split large Kubernetes patches into steps such as attaching a proxy, sharing a token directory, configuring exchange, and routing traffic
- Explain each step's purpose immediately before its command, and show the expected result where it helps learners verify progress
- Put commands and expected output in separate `sh` code blocks, with a blank line between them. Keep the `#` prefixes on expected output and put explanatory notes in prose
- Keep chapter 10 self-contained in each client path. Repeat the full procedure in the Codex and Open WebUI pages instead of replacing it with links to shared steps; this duplication is intentional
- Chapter 08 simply deploys `idthw-demo-api-mcp` in namespace `mcp` and verifies initialization and tool discovery. Add MCP protection in its own chapter
- The MCP application uses a supplied API access token, either configured at startup or provided by Runtime Proxy in a request-specific file. Runtime Proxy owns MCP token validation and downstream token exchange; only the proxy mounts the service identity
- Do not add forwarding modes or token-exchange logic to the MCP application to make an earlier tutorial step work
- Keep each chapter focused on its current learning goal. Next Steps should explain only the immediate next chapter, followed by a blank line and the `Next: [Chapter](./path.md)` link
- Initialize `_mcp_port=$(./tools/port.sh mcp)` in every shell block that uses `${_mcp_port}`
