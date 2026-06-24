import { auth } from "@/shared/lib/auth";
import { redirect } from "next/navigation";
import { getDocs } from "@/features/docs/api/server";
import CreateDocForm from "@/features/docs/ui/CreateDocForm";
import AccessTokenPanel from "@/features/docs/ui/AccessTokenPanel";
import { SignOutButton } from "@/features/auth/ui/SignInButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DocsPage() {
  const session = await auth();
  if (!session) redirect("/");

  let docs: { id: number; name: string; content: string }[] = [];
  let fetchError: string | null = null;
  try {
    docs = await getDocs();
  } catch (e: any) {
    fetchError = e.message;
  }

  const user = session.user;

  return (
    <main className="min-h-screen p-6 md:p-10" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--line-green)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--line-green)" }}>ID-JAG Demo</span>
            </div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Documents</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{user?.name}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{user?.email}</p>
            </div>
            <SignOutButton />
          </div>
        </div>

        {/* Access token */}
        <AccessTokenPanel />

        {/* Create form */}
        <CreateDocForm />

        {/* Docs list */}
        <section>
          <h2 className="text-xs font-semibold mb-3 tracking-wide" style={{ color: "var(--text-secondary)" }}>
            ALL DOCUMENTS
          </h2>

          {fetchError ? (
            <p className="text-sm text-destructive">{fetchError}</p>
          ) : docs.length === 0 ? (
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
          )}
        </section>
      </div>
    </main>
  );
}
