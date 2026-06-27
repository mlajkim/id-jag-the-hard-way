"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CreateDocForm from "./CreateDocForm";
import { deleteDocAction, getDocsAction } from "../api/actions";

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
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<Doc | null>(null);
  const [newDocId, setNewDocId]     = useState<number | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());
  const [ghostIds, setGhostIds]     = useState<Set<number>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const didAutoRefresh = useRef(false);

  useEffect(() => {
    if (accessToken && !didAutoRefresh.current) {
      didAutoRefresh.current = true;
      void refresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function confirmDelete() {
    if (!confirmDoc) return;
    const id = confirmDoc.id;
    setConfirmDoc(null);
    setDeletingId(id);
    const result = await deleteDocAction(id, accessToken);
    if ("error" in result) {
      setDeleteError(result.error);
    } else {
      setDeletedIds((prev) => new Set(prev).add(id));
    }
    setDeletingId(null);
  }

  function onDocCreated(doc: Doc) {
    setShowForm(false);
    setDocs((prev) => [doc, ...prev]);
    setNewDocId(doc.id);
    setTimeout(() => setNewDocId(null), 2000);
  }

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
      const freshIds = new Set(result.docs!.map((d) => d.id));

      setDocs((prev) => {
        // Docs present on server: keep as-is
        // Docs missing from server that were already ghosted: drop them
        // Docs missing from server that were not ghosted yet: keep as ghost
        const kept = prev.filter((d) => freshIds.has(d.id) || !ghostIds.has(d.id));
        // Merge in any new docs from server not already in list
        const prevIds = new Set(kept.map((d) => d.id));
        const added = result.docs!.filter((d) => !prevIds.has(d.id));
        return [...kept, ...added];
      });

      setGhostIds((prev) => {
        // Newly missing docs (not ghosted yet, not locally deleted) become ghosts
        const newGhosts = new Set(prev);
        docs.forEach((d) => {
          if (!freshIds.has(d.id) && !deletedIds.has(d.id) && !prev.has(d.id)) {
            newGhosts.add(d.id);
          }
        });
        // Docs that were already ghosted and still missing: they got dropped above, clear them
        prev.forEach((id) => { if (!freshIds.has(id)) newGhosts.delete(id); });
        return newGhosts;
      });

      setDeletedIds(new Set());
    }
    setRefreshing(false);
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-secondary)" }}>
            ALL DOCUMENTS
          </h2>
          <button
            onClick={() => setSortAsc((v) => !v)}
            title={sortAsc ? "Showing oldest first" : "Showing newest first"}
            className="flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded transition-opacity hover:opacity-70"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            {sortAsc ? "↑ Oldest" : "↓ Newest"}
          </button>
        </div>
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

      {/* New Document modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>New Document</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-lg leading-none hover:opacity-60"
                style={{ color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>
            <CreateDocForm accessToken={accessToken} onSuccess={onDocCreated} />
          </div>
        </div>
      )}

      {/* Error */}
      {!refreshing && fetchError && (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{fetchError}</p>
          {fetchError.includes("Expired") && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Your session has expired. Please{" "}
              <a href="/api/auth/signin" className="underline" style={{ color: "var(--line-green)" }}>
                sign in again
              </a>{" "}
              to continue.
            </p>
          )}
        </div>
      )}

      {/* List */}
      {!fetchError && (
        docs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{refreshing ? "Getting documents…" : "No documents yet."}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...docs].sort((a, b) => sortAsc ? a.id - b.id : b.id - a.id).map((doc) => (
              <Card
                key={doc.id}
                style={{
                  borderColor: newDocId === doc.id ? "var(--line-green)" : "var(--border)",
                  boxShadow: newDocId === doc.id ? "0 0 0 2px var(--line-green)" : "var(--shadow-sm)",
                  transition: "border-color 0.6s ease, box-shadow 0.6s ease, opacity 0.4s ease",
                  opacity: deletedIds.has(doc.id) || ghostIds.has(doc.id) ? 0.4 : 1,
                }}
              >
                <div className="flex items-start gap-2 pt-4 px-4 pb-1 w-full">
                  <p className="text-sm font-semibold flex-1 min-w-0" style={{ color: "var(--text-primary)", textDecoration: deletedIds.has(doc.id) || ghostIds.has(doc.id) ? "line-through" : "none" }}>
                    {doc.name}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary" className="text-xs">#{doc.id}</Badge>
                    {deletedIds.has(doc.id) || ghostIds.has(doc.id) ? (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: "var(--text-muted)", background: "var(--border)" }}>deleted</span>
                    ) : (
                      <button
                        onClick={() => setConfirmDoc(doc)}
                        disabled={deletingId === doc.id}
                        title="Delete document"
                        className="p-0.5 rounded hover:opacity-60 disabled:opacity-30 transition-opacity cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {deletingId === doc.id ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <CardContent className="px-4 pb-4">
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{doc.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
      {/* Delete confirmation modal */}
      {confirmDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setConfirmDoc(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Delete document?</h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>"{confirmDoc.name}"</span> will be permanently deleted.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmDoc(null)}
                className="flex-1 rounded-lg border py-2 text-sm font-medium cursor-pointer hover:opacity-70 transition-opacity"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-lg py-2 text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: "#ef4444", color: "#fff" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete error dialog */}
      {deleteError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setDeleteError(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-3"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Permission denied</h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              You don't have permission to delete this document.
            </p>
            <p className="text-xs font-mono break-all" style={{ color: "#ef4444" }}>{deleteError}</p>
            <button
              onClick={() => setDeleteError(null)}
              className="w-full rounded-lg border py-2 text-sm font-medium cursor-pointer hover:opacity-70 transition-opacity"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
