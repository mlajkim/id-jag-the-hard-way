import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT || 8101;
export const UPSTREAM_BASE_URL = process.env.UPSTREAM_BASE_URL || "http://localhost:14443";
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

export const corsOptions = {
  origin: "*", // 필요에 따라 OpenWebUI 도메인으로 제한
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-athenz-api-token"],
};
