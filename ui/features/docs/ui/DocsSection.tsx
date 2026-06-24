"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CreateDocForm from "./CreateDocForm";
import { getDocsAction } from "../api/actions";

interface Doc { id: number; name: string; content: string }

interface Props {
  docs: Doc[];
  fetchError: string | null;
  accessToken?: string;
}

export default function DocsSection({ docs: initialDocs, fetchError: initialError, accessToken }: Props) {
  const [docs, setDocs]             = useState<Doc[]>(initialDocs);
  const [fetchError, setFetchError] = useState<string | null>(initialError);
  const [showForm, setShowForm]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setFetchError(null);
    const [result] = await Promise.all([
      getDocsAction(accessToken),
      new Promise((r) => setTimeout(r, 1000)),
    ]);
    if (result.error) {
      setFetchError(result.error);
    } else {
      setDocs(result.docs!);
    }
    setRefreshing(false);
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-secondary)" }}>
          ALL DOCUMENTS
        </h2>
        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Refresh list"
            className="p-1 rounded-md transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ color: "var(--text-muted)" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className={refreshing ? "animate-spin" : ""}
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>

          {/* New Document toggle */}
          <Button
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            style={{ background: showForm ? "var(--border)" : "var(--line-green)", fontSize: "0.7rem", height: "1.75rem", padding: "0 0.65rem" }}
          >
            {showForm ? "Cancel" : "+ New Document"}
          </Button>
        </div>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="mb-4">
          <CreateDocForm onSuccess={() => { setShowForm(false); refresh(); }} />
        </div>
      )}

      {/* Loading state */}
      {refreshing && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Getting documents…</p>
      )}

      {/* Error */}
      {!refreshing && fetchError && (
        <p className="text-sm text-destructive">{fetchError}</p>
      )}

      {/* List */}
      {!refreshing && !fetchError && (
        docs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No documents yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {docs.map((doc) => (
              <Card key={doc.id} style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}>
                <CardHeader className="pb-1 pt-4 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {doc.name}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs shrink-0">#{doc.id}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{doc.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </section>
  );
}
