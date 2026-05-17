import { Router } from "express";
import { PUBLIC_BASE_URL } from "../config/env";
import { toolsRegistry } from "../config/registry";

const router = Router();

const ACCESS_MCP_REQUIRED_SCOPE = "api:role.mcp-accessor"
const HEADER_ATHENZ_REQUIRED_SCOPE = "x-athenz-required-scope"

router.get("/", (req, res) => {
  const paths: Record<string, any> = {};

  toolsRegistry.forEach((tool) => {
    if (!paths[tool.path]) {
      paths[tool.path] = {};
    }

    const operation: any = {
      operationId: tool.operationId,
      summary: tool.summary,
      description: tool.description,
      [HEADER_ATHENZ_REQUIRED_SCOPE]: ACCESS_MCP_REQUIRED_SCOPE + " " + tool.scope,
      responses: {
        "200": { description: "Successful response" },
        "400": { description: "Bad Request" },
        "401": { description: "Unauthorized" },
        "403": { description: "Forbidden" },
        "404": { description: "Not Found" },
        "500": { description: "Internal Server Error" },
      },
    };

    if (tool.requestBodySchema) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: tool.requestBodySchema,
          },
        },
      };
    }

    paths[tool.path][tool.method] = operation;
  });

  const openapiSpec = {
    openapi: "3.1.0",
    info: {
      title: "OpenAPI MCP Server for API",
      version: "1.0.0",
      description: "Auto-generated OpenAPI spec from registry",
    },
    servers: [
      {
        url: PUBLIC_BASE_URL || "http://localhost:8101",
      },
    ],
    paths,
  };

  res.json(openapiSpec);
});

export default router;
