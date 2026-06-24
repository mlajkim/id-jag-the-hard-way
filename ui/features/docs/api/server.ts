import { auth } from "@/shared/lib/auth";
import { config } from "@/shared/config";

async function authHeaders() {
  const session = await auth();
  const idToken = (session as any)?.idToken as string | undefined;
  if (!idToken) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
}

export async function getDocs(): Promise<{ id: number; name: string; content: string }[]> {
  const res = await fetch(`${config.api.serverUrl}/api/docs`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.docs;
}

export async function createDoc(name: string, content: string) {
  const res = await fetch(`${config.api.serverUrl}/api/docs`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ name, content }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
