"use server";

import { revalidatePath } from "next/cache";
import { createDoc, getDocs } from "./server";

export async function createDocAction(_: unknown, formData: FormData) {
  const name = formData.get("name") as string;
  const content = formData.get("content") as string;
  if (!name?.trim() || !content?.trim()) {
    return { error: "Name and content are required." };
  }
  try {
    await createDoc(name.trim(), content.trim());
    revalidatePath("/docs");
    return { success: true };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function getDocsAction(accessToken?: string): Promise<
  { docs: { id: number; name: string; content: string }[]; error: null } |
  { docs: null; error: string }
> {
  try {
    const docs = await getDocs(accessToken);
    return { docs, error: null };
  } catch (e: any) {
    return { docs: null, error: e.message };
  }
}
