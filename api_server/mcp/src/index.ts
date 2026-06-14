import express from "express";
import cors from "cors";
import {
  PORT,
  UPSTREAM_BASE_URL,
  PUBLIC_BASE_URL,
  corsOptions,
} from "./config/env";
import openapiRouter from "./routes/openapi";
import mcpRouter from "./routes/mcp";
import { toolsRegistry } from "./config/registry";
import morgan from "morgan";

const app = express();

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(
  morgan(":date[iso] [INFO] :method :url :status - :response-time ms"),
);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/openapi.json", openapiRouter);

app.use("/mcp", mcpRouter);

toolsRegistry.forEach((tool) => {
  app[tool.method](tool.path.replace(/\{([^}]+)\}/g, ":$1"), async (req, res) => {
    try {
      await tool.handler(req, res, tool.scope);
    } catch (error: any) {
      console.error(`[Handler Error] ${tool.operationId}:`, error);
      res.status(500).json({ error: error.message });
    }
  });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`OpenAPI MCP Server for API listening on: ${PUBLIC_BASE_URL}`);
  console.log(`Upstream API: ${UPSTREAM_BASE_URL}`);
  console.log(`OpenAPI Spec available at: ${PUBLIC_BASE_URL}/openapi.json`);
  console.log(`MCP endpoint available at: ${PUBLIC_BASE_URL}/mcp`);
});
