"use client";

import { useState, useTransition } from "react";
import { fetchAccessToken } from "../api/fetchAt";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AT { at: string; scope: string; exp: number }

const OPERATIONS = [
  { label: "GET",    scope: "api:role.docs-getter"  },
  { label: "POST",   scope: "api:role.docs-poster"  },
  { label: "DELETE", scope: "api:role.docs-deleter" },
] as const;

export default function AccessTokenPanel() {
  const [checked, setChecked] = useState<Set<string>>(new Set(["GET"]));
  const [result, setResult]   = useState<AT | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [isPending, start]    = useTransition();

  function toggle(label: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function handle() {
    const scopes = OPERATIONS
      .filter(({ label }) => checked.has(label))
      .map(({ scope }) => scope)
      .join(" ");
    if (!scopes) return;
    setError(null);
    start(async () => {
      try {
        setResult(await fetchAccessToken(scopes));
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <div
      className="rounded-xl border p-5 space-y-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}
    >
      <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
        Athenz Access Token
      </h2>

      <div className="flex items-center gap-4 flex-wrap">
        {OPERATIONS.map(({ label }) => (
          <label key={label} className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked.has(label)}
              onChange={() => toggle(label)}
              className="accent-[#06C755] w-4 h-4 cursor-pointer"
            />
            <span className="text-xs font-mono font-medium" style={{ color: "var(--text-primary)" }}>
              {label}
            </span>
          </label>
        ))}
        <Button
          size="sm"
          disabled={isPending || checked.size === 0}
          onClick={handle}
          className="ml-auto"
          style={{ background: "var(--line-green)" }}
        >
          {isPending ? "Fetching…" : "Get Access Token"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive break-all">{error}</p>}

      {result && (
        <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            {result.scope.split(" ").map((s) => (
              <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>
            ))}
            <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
              exp {new Date(result.exp * 1000).toLocaleTimeString()}
            </span>
          </div>
          <textarea
            readOnly
            value={result.at}
            rows={3}
            className="w-full rounded-lg border p-3 font-mono text-xs resize-none"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg)" }}
          />
        </div>
      )}
    </div>
  );
}
