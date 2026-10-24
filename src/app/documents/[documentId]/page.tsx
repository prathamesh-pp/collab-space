import { Suspense } from "react";
import DocumentEditor from "./document-editor";

async function DocumentPageContent({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <DocumentEditor documentId={documentId} />;
}

export default function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] text-sm text-slate-600">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            Loading document...
          </div>
        </main>
      }
    >
      <DocumentPageContent params={params} />
    </Suspense>
  );
}