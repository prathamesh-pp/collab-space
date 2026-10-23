"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Bold,
  Check,
  FileText,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Save,
  Undo2,
  Redo2,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { canEdit } from "@/lib/permissions";

type DocumentData = {
  id: string;
  title: string;
  updatedAt: string;
  content: JSONContent | null;
  contentRevision: number;
  workspace: { id: string; name: string };
};

type WorkspaceRole = "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER";

const editorExtensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    strike: false,
    underline: false,
  }),
  Placeholder.configure({ placeholder: "Start writing..." }),
];

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";

function RichTextEditor({
  documentId,
  initialContent,
  initialRevision,
  editable,
}: {
  documentId: string;
  initialContent: JSONContent | null;
  initialRevision: number;
  editable: boolean;
}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const revisionRef = useRef(initialRevision);
  const latestContentRef = useRef<JSONContent | null>(null);
  const editVersionRef = useRef(0);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSaveRef = useRef<() => Promise<void>>(async () => {});
  const contentEditable = editable && saveStatus !== "conflict";

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: contentEditable,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "document-content" },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      if (!contentEditable) return;
      latestContentRef.current = updatedEditor.getJSON();
      editVersionRef.current += 1;
      if (conflictRef.current) return;
      setSaveStatus("unsaved");
      scheduleSave(700);
    },
  });

  async function flushSave() {
    const content = latestContentRef.current;
    if (!editable || !content || savingRef.current || conflictRef.current) return;

    const savedVersion = editVersionRef.current;
    savingRef.current = true;
  if (mountedRef.current) setSaveStatus("saving");

    try {
      const response = await fetch(`/api/documents/${documentId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          expectedRevision: revisionRef.current,
        }),
      });
      const data = await response.json();

      if (response.status === 409) {
        conflictRef.current = true;
        if (mountedRef.current) setSaveStatus("conflict");
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? "Could not save document content.");
      }

      revisionRef.current = data.contentRevision;
      if (mountedRef.current) {
        setSaveStatus(
          savedVersion === editVersionRef.current ? "saved" : "unsaved",
        );
      }
    } catch {
      if (mountedRef.current) setSaveStatus("error");
    } finally {
      savingRef.current = false;
      if (
        !conflictRef.current &&
        savedVersion !== editVersionRef.current &&
        timerRef.current === null
      ) {
        scheduleSave(0);
      }
    }
  }

  function scheduleSave(delay: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushSave();
    }, delay);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void flushSaveRef.current();
      }
    };
  }, []);

  useEffect(() => {
    flushSaveRef.current = flushSave;
  });

  const disabled = !contentEditable || !editor;

  return (
    <>
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 py-2"
      >
        <ToolbarButton
          label="Bold"
          active={editor?.isActive("bold")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={17} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor?.isActive("italic")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={17} aria-hidden="true" />
        </ToolbarButton>
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-slate-200" />
        <ToolbarButton
          label="Heading 1"
          active={editor?.isActive("heading", { level: 1 })}
          disabled={disabled}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <Heading1 size={18} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={editor?.isActive("heading", { level: 2 })}
          disabled={disabled}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 size={18} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Bulleted list"
          active={editor?.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={18} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor?.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={18} aria-hidden="true" />
        </ToolbarButton>
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-slate-200" />
        <ToolbarButton
          label="Undo"
          disabled={disabled || !editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 size={17} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={disabled || !editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 size={17} aria-hidden="true" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />
      {editable ? (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <p role="status" aria-live="polite">
            {saveStatus === "saved" && "All changes saved"}
            {saveStatus === "unsaved" && "Unsaved changes"}
            {saveStatus === "saving" && "Saving changes..."}
            {saveStatus === "error" && "Could not save changes."}
            {saveStatus === "conflict" &&
              "A newer version exists. Reload before editing further."}
          </p>
          {saveStatus === "error" && (
            <button
              type="button"
              onClick={() => void flushSave()}
              className="font-semibold text-indigo-700 hover:text-indigo-900"
            >
              Retry
            </button>
          )}
          {saveStatus === "conflict" && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-semibold text-indigo-700 hover:text-indigo-900"
            >
              Reload document
            </button>
          )}
        </div>
      ) : (
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          Read-only access
        </p>
      )}
    </>
  );
}

export default function DocumentEditor({
  documentId,
}: {
  documentId: string;
}) {
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadDocument() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Could not load this document.");
        }

        setDocument(data.document);
        setRole(data.role);
        setTitle(data.document.title);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to connect to the server. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadDocument();
    return () => controller.abort();
  }, [documentId]);

  async function saveTitle() {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("Document title cannot be empty.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save the document title.");
        return;
      }

      setTitle(data.document.title);
      setDocument((current) =>
        current
          ? {
              ...current,
              title: data.document.title,
              updatedAt: data.document.updatedAt,
            }
          : current,
      );
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const editable = canEdit(role ?? "");
  const titleChanged = document !== null && title.trim() !== document.title;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            <span>Workspace</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
            <FileText size={17} className="shrink-0 text-indigo-600" aria-hidden="true" />
            <span className="truncate">{document?.workspace.name ?? "Document"}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        {loading ? (
          <p role="status" className="py-20 text-center text-sm text-slate-500">
            Loading document...
          </p>
        ) : error && !document ? (
          <section className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-6 text-center">
            <h1 className="text-lg font-semibold">Document unavailable</h1>
            <p role="alert" className="mt-2 text-sm text-rose-700">
              {error}
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to workspace
            </Link>
          </section>
        ) : document ? (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="mb-3 text-xs font-semibold uppercase text-indigo-700">
                  {document.workspace.name}
                </p>
                <label className="sr-only" htmlFor="document-title">
                  Document title
                </label>
                <input
                  id="document-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveTitle();
                    }
                  }}
                  disabled={!editable}
                  maxLength={120}
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-3xl font-bold outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-300 sm:text-4xl disabled:text-slate-800"
                />
                <p className="mt-2 text-sm text-slate-500">
                  {editable ? "Your document" : "Read-only access"}
                </p>
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => void saveTitle()}
                  disabled={saving || !titleChanged || !title.trim()}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-indigo-700 px-4 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : titleChanged ? (
                    <Save size={16} aria-hidden="true" />
                  ) : (
                    <Check size={16} aria-hidden="true" />
                  )}
                  {saving ? "Saving" : titleChanged ? "Save title" : "Saved"}
                </button>
              )}
            </div>

            {error && (
              <p role="alert" className="mb-4 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <RichTextEditor
                key={document.id}
                documentId={document.id}
                initialContent={document.content}
                initialRevision={document.contentRevision}
                editable={editable}
              />
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}