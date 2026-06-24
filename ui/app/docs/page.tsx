import { auth } from "@/shared/lib/auth";
import { redirect } from "next/navigation";
import { getDocs } from "@/features/docs/api/server";
import DocsPageClient from "@/features/docs/ui/DocsPageClient";
import { SignOutButton } from "@/features/auth/ui/SignInButton";

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

        <DocsPageClient docs={docs} fetchError={fetchError} />
      </div>
    </main>
  );
}
