import fs from "fs";
import https from "https";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/shared/config";

export const runtime = "nodejs";

const DOMAIN = "api";
const ROLE = "jag-exchanging-ai-agents";
const MEMBERS = [
  "ai.open-webui",
  "human.idjag-learner.claude",
  "human.idjag-learner.codex",
] as const;

type ZmsResponse = { statusCode: number; body: string };

function resolveFromUi(pathname: string) {
  return path.isAbsolute(pathname) ? pathname : path.resolve(process.cwd(), pathname);
}

function agent() {
  return new https.Agent({
    cert: fs.readFileSync(resolveFromUi(config.athenz.adminCertPath)),
    key: fs.readFileSync(resolveFromUi(config.athenz.adminKeyPath)),
    rejectUnauthorized: false,
  });
}

function requestZms(method: "GET" | "PUT" | "DELETE", urlPath: string, body?: string): Promise<ZmsResponse> {
  const zms = config.athenz.zmsUrl.replace(/\/$/, "");
  const url = new URL(`${zms}${urlPath}`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + (url.search || ""),
        method,
        agent: agent(),
        headers: {
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 500, body: data }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function GET() {
  try {
    const res = await requestZms("GET", `/domain/${DOMAIN}/role/${ROLE}?members=true`);
    if (res.statusCode === 404) return NextResponse.json({ enabled: false, members: [] });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return NextResponse.json({ error: res.body || `ZMS returned ${res.statusCode}` }, { status: 502 });
    }
    const role = JSON.parse(res.body) as { roleMembers?: { memberName: string }[] };
    const members = (role.roleMembers ?? []).map((m) => m.memberName);
    return NextResponse.json({ enabled: members.length > 0, members });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown ZMS error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
    }

    if (body.enabled) {
      for (const member of MEMBERS) {
        const res = await requestZms(
          "PUT",
          `/domain/${DOMAIN}/role/${ROLE}/member/${member}`,
          JSON.stringify({ memberName: member, roleName: ROLE }),
        );
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return NextResponse.json({ error: `Failed to add ${member}: ${res.body}` }, { status: 502 });
        }
      }
    } else {
      for (const member of MEMBERS) {
        const res = await requestZms("DELETE", `/domain/${DOMAIN}/role/${ROLE}/member/${member}`);
        if (res.statusCode !== 404 && (res.statusCode < 200 || res.statusCode >= 300)) {
          return NextResponse.json({ error: `Failed to remove ${member}: ${res.body}` }, { status: 502 });
        }
      }
    }

    return NextResponse.json({ enabled: body.enabled, members: body.enabled ? MEMBERS : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown ZMS error" }, { status: 500 });
  }
}
