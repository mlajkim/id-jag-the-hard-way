import { Request, Response } from "express";
import { UPSTREAM_BASE_URL, DANGEROUSLY_SHOW_RAW_ACCESS_TOKEN } from "./env";
import { exchangeAthenzAT } from "../utils/exchange-athenz-at"
import { getAtFromReq } from "../utils/readAtFromReq"

export type HttpMethod = "get" | "post" | "put" | "delete";

export interface ToolDefinition {
  path: string;
  method: HttpMethod;
  operationId: string;
  summary: string;
  description: string;
  scope: string; // required scope for that specific endpoint
  requestBodySchema?: any;
  handler: (req: Request, res: Response, scope: string) => Promise<void>;
}

const debugTools: ToolDefinition[] = DANGEROUSLY_SHOW_RAW_ACCESS_TOKEN
  ? [
      {
        path: "/debug/raw-token",
        method: "get",
        operationId: "get_raw_access_token",
        summary: "Get Raw Access Token (DEBUG)",
        description: "Debug tool: returns the raw access token received in the Authorization header, without any token exchange. Only available when DANGEROUSLY_SHOW_RAW_ACCESS_TOKEN=true.",
        scope: "",
        handler: async (req, res, _scope) => {
          const token = getAtFromReq(req);
          res.status(200).json({ raw_access_token: token });
        },
      },
    ]
  : [];

export const toolsRegistry: ToolDefinition[] = [
  ...debugTools,
  {
    path: "/api/docs",
    method: "get",
    operationId: "get_k8s_docs",
    summary: "Get Kubernetes Documents",
    description: "Get the list of documents from the API running on local Kubernetes.",
    scope: "api:role.docs-getter",
    handler: async (req, res, scope) => {
      try {
        const at = await exchangeAthenzAT(req, scope)
        
        const response = await fetch(`${UPSTREAM_BASE_URL}/api/docs`, {
          headers: {
            "Authorization": `Bearer ${at}`,
            "Content-Type": "application/json",
          },
        });
        
        const data = await response.text();
        res.status(response.status).send(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  },
  {
    path: "/api/docs/{doc_id}",
    method: "delete",
    operationId: "delete_k8s_doc",
    summary: "Delete Kubernetes Document",
    description: "Delete a document with the specified ID from the API running on local Kubernetes.",
    scope: "api:role.docs-deleter",
    handler: async (req, res, scope) => {
      try {
        const docId = req.params.doc_id;
        const at = await exchangeAthenzAT(req, scope)
        
        const response = await fetch(`${UPSTREAM_BASE_URL}/api/docs/${docId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${at}`,
            "Content-Type": "application/json",
          },
        });
        
        const data = await response.text();
        res.status(response.status).send(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  },
  {
    path: "/api/docs",
    method: "post",
    operationId: "post_k8s_doc",
    summary: "Post Kubernetes Document",
    description: "Post a new document to the API running on local Kubernetes.",
    requestBodySchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "title of the document" },
        content: { type: "string", description: "content of the document" },
      },
      required: ["name", "content"],
    },
    scope: "api:role.docs-poster",
    handler: async (req, res, scope) => {
      try {
        const at = await exchangeAthenzAT(req, scope)

        const response = await fetch(`${UPSTREAM_BASE_URL}/api/docs`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${at}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req.body),
        });

        const data = await response.text();
        res.status(response.status).send(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  },
];