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
        <main className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
          Loading document...
        </main>
      }
    >
      <DocumentPageContent params={params} />
    </Suspense>
  );
}