"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, X } from "lucide-react";
import { closeDialogOnEscape } from "@/lib/dialog-accessibility";

export function CreateDocumentDialog({
  workspaceName,
  onClose,
  onCreate,
}: {
  workspaceName: string;
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const documentTitle = title.trim();
    if (!documentTitle) {
      setError("Document title cannot be empty.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onCreate(documentTitle);
      onClose();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create the document. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="create-document-title"
      onClose={onClose}
      onKeyDown={(event) => closeDialogOnEscape(event, onClose)}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="create-document-dialog fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-slate-900 backdrop:bg-slate-950/35 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(32rem,calc(100dvh-3rem))] sm:w-[min(30rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
    >
      <section className="flex h-full max-h-full flex-col overflow-y-auto bg-[#f7f8fa] shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <FileText size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="create-document-title"
                className="text-lg font-semibold tracking-tight"
              >
                Create a document
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                In {workspaceName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create document dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form
          onSubmit={submitDocument}
          className="flex flex-1 flex-col justify-between gap-6 px-5 py-6 sm:px-6"
        >
          <div>
            <label
              htmlFor="document-title"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Document title
            </label>
            <input
              id="document-title"
              name="document-title"
              type="text"
              autoFocus
              required
              maxLength={120}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. Project brief"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            {error && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                {error}
              </p>
            )}
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "Creating..." : "Create document"}
            </button>
          </footer>
        </form>
      </section>
    </dialog>
  );
}
