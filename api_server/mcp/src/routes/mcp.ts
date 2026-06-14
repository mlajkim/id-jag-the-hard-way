import { Router, Request } from "express";
import { UPSTREAM_BASE_URL } from "../config/env";
import { toolsRegistry, type ToolDefinition } from "../config/registry";

const router = Router();

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: any;
};

function result(id: JsonRpcId, value: any) {
  return {
    jsonrpc: "2.0",
    id,
    result: value,
  };
}

function error(id: JsonRpcId, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

function hasId(message: JsonRpcRequest): boolean {
  return Object.prototype.hasOwnProperty.call(message, "id");
}

function getPathParamNames(path: string): string[] {
  const names: string[] = [];
  const regex = /\{([^}]+)\}/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(path)) !== null) {
    names.push(match[1]);
  }

  return names;
}

function fillPathParams(path: string, args: Record<string, any>): string {
  return path.replace(/\{([^}]+)\}/g, (_all, name: string) => {
    const value = args[name];

    if (value === undefined || value === null || value === "") {
      throw new Error(`Missing required path parameter: ${name}`);
    }

    return encodeURIComponent(String(value));
  });
}

function buildInputSchema(tool: ToolDefinition) {
  const pathParams = getPathParamNames(tool.path);

  const schema =
    tool.requestBodySchema !== undefined
      ? JSON.parse(JSON.stringify(tool.requestBodySchema))
      : {
          type: "object",
          properties: {},
          required: [],
        };

  schema.type ??= "object";
  schema.properties ??= {};
  schema.required ??= [];

  for (const param of pathParams) {
    schema.properties[param] = {
      type: "string",
      description: `Path parameter: ${param}`,
    };

    if (!schema.required.includes(param)) {
      schema.required.push(param);
    }
  }

  if (Object.keys(schema.properties).length === 0) {
    return {
      type: "object",
      additionalProperties: false,
    };
  }

  return schema;
}

function toMcpTool(tool: ToolDefinition) {
  return {
    name: tool.operationId,
    title: tool.summary,
    description: `${tool.description}\n\nForwarded endpoint: ${tool.method.toUpperCase()} ${tool.path}`,
    inputSchema: buildInputSchema(tool),
  };
}

function pickNonPathArgs(tool: ToolDefinition, args: Record<string, any>) {
  const pathParamNames = new Set(getPathParamNames(tool.path));
  const bodyOrQuery: Record<string, any> = {};

  for (const [key, value] of Object.entries(args)) {
    if (!pathParamNames.has(key)) {
      bodyOrQuery[key] = value;
    }
  }

  return bodyOrQuery;
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function forwardToUpstream(req: Request, tool: ToolDefinition, args: any) {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};

  const path = fillPathParams(tool.path, normalizedArgs);
  const url = new URL(path, UPSTREAM_BASE_URL);

  const nonPathArgs = pickNonPathArgs(tool, normalizedArgs);

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
  };

  const incomingAuth = req.header("Authorization");
  if (incomingAuth) {
    headers.Authorization = incomingAuth;
  }

  let body: string | undefined;

  if (tool.method === "get" || tool.method === "delete") {
    for (const [key, value] of Object.entries(nonPathArgs)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    }
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(nonPathArgs);
  }

  const upstreamRes = await fetch(url, {
    method: tool.method.toUpperCase(),
    headers,
    body,
  });

  const text = await upstreamRes.text();

  return {
    status: upstreamRes.status,
    ok: upstreamRes.ok,
    data: tryParseJson(text),
  };
}

router.get("/", (_req, res) => {
  res.setHeader("Allow", "POST");
  res.sendStatus(405);
});

router.delete("/", (_req, res) => {
  res.setHeader("Allow", "POST");
  res.sendStatus(405);
});

router.post("/", async (req, res) => {
  const message = req.body as JsonRpcRequest;

  if (
    !message ||
    message.jsonrpc !== "2.0" ||
    typeof message.method !== "string"
  ) {
    res.status(400).json(error(null, -32600, "Invalid JSON-RPC request"));
    return;
  }

  if (!hasId(message)) {
    res.sendStatus(202);
    return;
  }

  const id = message.id ?? null;

  try {
    switch (message.method) {
      case "initialize": {
        res.json(
          result(id, {
            protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: "id-jag-the-hard-way-mcp",
              title: "ID-JAG The Hard Way MCP",
              version: "0.1.0",
            },
          }),
        );
        return;
      }

      case "ping": {
        res.json(result(id, {}));
        return;
      }

      case "tools/list": {
        res.json(
          result(id, {
            tools: toolsRegistry.map(toMcpTool),
          }),
        );
        return;
      }

      case "tools/call": {
        const name = message.params?.name;
        const args = message.params?.arguments ?? {};

        if (typeof name !== "string") {
          res.json(error(id, -32602, "tools/call params.name must be string"));
          return;
        }

        const tool = toolsRegistry.find((t) => t.operationId === name);

        if (!tool) {
          res.json(error(id, -32602, `Unknown tool: ${name}`));
          return;
        }

        const upstreamResult = await forwardToUpstream(req, tool, args);
        const pretty = JSON.stringify(upstreamResult, null, 2);

        res.json(
          result(id, {
            content: [
              {
                type: "text",
                text: pretty,
              },
            ],
            structuredContent: upstreamResult,
            isError: !upstreamResult.ok,
          }),
        );
        return;
      }

      default: {
        res.json(error(id, -32601, `Method not found: ${message.method}`));
        return;
      }
    }
  } catch (e: any) {
    res.json(error(id, -32603, e?.message ?? String(e)));
  }
});

export default router;
