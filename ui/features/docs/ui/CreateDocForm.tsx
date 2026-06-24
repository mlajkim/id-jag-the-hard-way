"use client";

import { useActionState } from "react";
import { createDocAction } from "../api/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props { onSuccess?: () => void }

export default function CreateDocForm({ onSuccess }: Props = {}) {
  const [state, action, pending] = useActionState(
    async (prev: any, formData: FormData) => {
      const result = await createDocAction(prev, formData);
      if (result?.success) onSuccess?.();
      return result;
    },
    null,
  );

  return (
    <form
      action={action}
      className="rounded-xl border p-5 space-y-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}
    >
      <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
        New Document
      </h2>

      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-xs" style={{ color: "var(--text-secondary)" }}>Title</Label>
        <Input id="name" name="name" placeholder="My doc" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content" className="text-xs" style={{ color: "var(--text-secondary)" }}>Content</Label>
        <Input id="content" name="content" placeholder="Write something…" required />
      </div>

      {state?.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs" style={{ color: "var(--line-green)" }}>Document created.</p>
      )}

      <Button type="submit" disabled={pending} className="w-full" style={{ background: "var(--line-green)" }}>
        {pending ? "Creating…" : "Create"}
      </Button>
    </form>
  );
}
