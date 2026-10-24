"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Bold,
  Check,
  CheckCircle2,
  FileText,
  History,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
  Eye,
  Undo2,
  Redo2,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { canComment, canEdit } from "@/lib/permissions";
import { getRoleAccessDescription } from "@/lib/document-access";
import { syncDocumentEditorEditability } from "@/lib/document-editor-state";
import { closeDialogOnEscape } from "@/lib/dialog-accessibility";
import { createCollaborationClient } from "@/collaboration/client";
import { createCollaborativeEditorExtensions } from "@/collaboration/editor-extensions";
import {
  isCollaborationOperationallyEnabled,
  selectDocumentEditorMode,
} from "@/collaboration/feature-flag";

type DocumentData = {
  id: string;
  title: string;
  updatedAt: string;
  content: JSONContent | null;
  contentRevision: number;
  workspace: { id: string; name: string };
};

type WorkspaceRole = "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER";
type DocumentComment = {
  id: string;
  text: string;
  createdAt: string;
  resolvedAt: string | null;
  author: string;
  isOwnComment: boolean;
};

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
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-indigo-100 text-indigo-800"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  editor,
  disabled,
}: {
  editor: Editor | null;
  disabled: boolean;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-1 border-b border-slate-200/80 bg-white/95 px-3 py-2 sm:px-5"
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
      <span className="ml-auto hidden pr-1 text-xs font-medium text-slate-400 sm:inline">
        Formatting
      </span>
    </div>
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

  useEffect(() => {
    syncDocumentEditorEditability(editor, editable, saveStatus);
  }, [editor, editable, saveStatus]);

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
      <EditorToolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} />
      {editable ? (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 sm:px-6">
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
              className="rounded-md px-2 py-1 font-semibold text-indigo-700 transition hover:bg-indigo-50 hover:text-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
            >
              Retry
            </button>
          )}
          {saveStatus === "conflict" && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md px-2 py-1 font-semibold text-indigo-700 transition hover:bg-indigo-50 hover:text-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
            >
              Reload document
            </button>
          )}
        </div>
      ) : (
        <p className="border-t border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 sm:px-6">
          Read-only access
        </p>
      )}
    </>
  );
}

type CollaborationPhase =
  | "connecting"
  | "syncing"
  | "synced"
  | "reconnecting"
  | "authentication-failed"
  | "error";

type CollaborationClient = ReturnType<typeof createCollaborationClient>;

function SyncedCollaborativeEditor({
  client,
}: {
  client: CollaborationClient;
}) {
  const extensions = useMemo(
    () => createCollaborativeEditorExtensions(
      client.provider,
      client.document,
    ),
    [client],
  );
  const editor = useEditor({
    extensions,
    editable: true,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "document-content" },
    },
  }, [client]);

  return (
    <>
      <EditorToolbar editor={editor} disabled={!editor} />
      <EditorContent editor={editor} />
    </>
  );
}

function CollaborativeRichTextEditor({
  documentId,
}: {
  documentId: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [client, setClient] = useState<CollaborationClient | null>(null);
  const [phase, setPhase] = useState<CollaborationPhase>("connecting");
  const websocketUrl = process.env.NEXT_PUBLIC_COLLABORATION_URL;

  useEffect(() => {
    let active = true;
    let clientForEffect: CollaborationClient | null = null;
    let connectedBefore = false;
    let authenticationFailed = false;
    if (websocketUrl) {
      void Promise.resolve().then(() => {
        if (!active) return;
        try {
          const newClient = createCollaborationClient({
            documentId,
            url: websocketUrl,
            callbacks: {
              onStatus(status) {
                if (!active || authenticationFailed) return;
                if (status === "connected") {
                  connectedBefore = true;
                  setPhase("syncing");
                } else if (status === "disconnected") {
                  setPhase("reconnecting");
                } else if (status === "connecting") {
                  setPhase(connectedBefore ? "reconnecting" : "connecting");
                }
              },
              onSynced(synced) {
                if (!active || authenticationFailed) return;
                setPhase(synced ? "synced" : "syncing");
              },
              onAuthenticationFailed() {
                if (!active) return;
                authenticationFailed = true;
                setPhase("authentication-failed");
              },
            },
          });
          clientForEffect = newClient;
          setClient(newClient);
        } catch {
          setClient(null);
          setPhase("error");
        }
      });
    }

    return () => {
      active = false;
      clientForEffect?.destroy();
    };
  }, [attempt, documentId, websocketUrl]);

  const messages: Record<CollaborationPhase, string> = {
    connecting: "Connecting to collaborative editing...",
    syncing: "Connected. Syncing the document...",
    synced: "Connected to collaborators.",
    reconnecting: "Disconnected. Reconnecting; editing is paused.",
    "authentication-failed":
      "Collaboration authentication failed. Check access and try again.",
    error: "Could not start collaborative editing.",
  };

  const visiblePhase = websocketUrl ? phase : "error";

  return (
    <>
      {visiblePhase === "synced" && client && (
        <SyncedCollaborativeEditor client={client} />
      )}
      <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        <p role={visiblePhase === "authentication-failed" || visiblePhase === "error" ? "alert" : "status"} aria-live="polite">
          {!websocketUrl
            ? "Collaboration WebSocket URL is not configured."
            : messages[visiblePhase]}
        </p>
        <p className="mt-1">
          The server persists updates asynchronously; connection sync does not confirm a durable database save.
        </p>
        {websocketUrl &&
          (visiblePhase === "authentication-failed" ||
            visiblePhase === "error") && (
          <button
            type="button"
            onClick={() => {
              setPhase("connecting");
              setAttempt((current) => current + 1);
            }}
            className="mt-2 font-semibold text-indigo-700 hover:text-indigo-900"
          >
            Retry connection
          </button>
          )}
      </div>
    </>
  );
}

function CommentsPanel({
  documentId,
  role,
}: {
  documentId: string;
  role: WorkspaceRole | null;
}) {
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const mayComment = canComment(role ?? "");

  useEffect(() => {
    const controller = new AbortController();

    async function loadComments() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/documents/${documentId}/comments`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Could not load comments.");
        }
        setComments(data.comments);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load comments. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadComments();
    return () => controller.abort();
  }, [documentId, reloadToken]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextText = text.trim();
    if (!nextText || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nextText }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not post this comment.");
      }
      setText("");
      setReloadToken((current) => current + 1);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to post this comment. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function updateComment(comment: DocumentComment, resolved: boolean) {
    setBusyCommentId(comment.id);
    setError("");
    try {
      const response = await fetch(
        `/api/documents/${documentId}/comments/${comment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolved }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not update this comment.");
      }
      setReloadToken((current) => current + 1);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update this comment. Please try again.",
      );
    } finally {
      setBusyCommentId(null);
    }
  }

  async function removeComment(comment: DocumentComment) {
    setBusyCommentId(comment.id);
    setError("");
    try {
      const response = await fetch(
        `/api/documents/${documentId}/comments/${comment.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not delete this comment.");
      }
      setReloadToken((current) => current + 1);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete this comment. Please try again.",
      );
    } finally {
      setBusyCommentId(null);
    }
  }

  return (
    <section
      aria-labelledby="comments-heading"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <MessageSquare size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id="comments-heading" className="font-semibold text-slate-900">
              Comments
            </h2>
            <p className="text-xs text-slate-500">
              {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
          Shared with workspace
        </span>
      </div>

      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:mx-6">
          {error}
        </p>
      )}

      <div className="max-h-[30rem] space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
        {loading ? (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-7 text-center">
            <MessageSquare size={20} className="mx-auto text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-slate-700">No comments yet</p>
            <p className="mt-1 text-xs text-slate-500">Start a conversation about this document.</p>
          </div>
        ) : (
          comments.map((comment) => {
            const busy = busyCommentId === comment.id;
            return (
              <article
                key={comment.id}
                className={`rounded-xl border px-4 py-3 ${
                  comment.resolvedAt
                    ? "border-slate-200 bg-slate-50/80"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words whitespace-pre-wrap text-sm leading-6 text-slate-800">
                      {comment.text}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{comment.author}</span>
                      <span aria-hidden="true"> · </span>
                      <time dateTime={comment.createdAt}>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(comment.createdAt))}
                      </time>
                      {comment.resolvedAt && (
                        <span className="ml-2 inline-flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCircle2 size={13} aria-hidden="true" />
                          Resolved
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {mayComment && (
                      <button
                        type="button"
                        onClick={() => void updateComment(comment, !comment.resolvedAt)}
                        disabled={busy}
                        aria-label={`${comment.resolvedAt ? "Reopen" : "Resolve"} comment`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-700 disabled:opacity-50"
                      >
                        {comment.resolvedAt ? (
                          <RotateCcw size={14} aria-hidden="true" />
                        ) : (
                          <CheckCircle2 size={14} aria-hidden="true" />
                        )}
                        <span>{comment.resolvedAt ? "Reopen" : "Resolve"}</span>
                      </button>
                    )}
                    {comment.isOwnComment && (
                      <button
                        type="button"
                        onClick={() => void removeComment(comment)}
                        disabled={busy}
                        aria-label="Delete your comment"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-indigo-700 disabled:opacity-50"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {mayComment ? (
        <form
          onSubmit={submitComment}
          className="border-t border-slate-100 bg-slate-50/60 p-4 sm:px-6 sm:py-5"
        >
          <label htmlFor="new-comment" className="mb-2 block text-sm font-semibold text-slate-800">
            Add a comment
          </label>
          <textarea
            id="new-comment"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Share a thought with your workspace..."
            className="block w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">{text.length}/2000</span>
            <button
              type="submit"
              disabled={submitting || !text.trim() || text.length > 2000}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={15} aria-hidden="true" />
              )}
              {submitting ? "Posting..." : "Post comment"}
            </button>
          </div>
        </form>
      ) : (
        <p className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 text-sm text-slate-600 sm:px-6">
          You have read-only access to comments.
        </p>
      )}
    </section>
  );
}

function VersionHistoryDialog({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: WorkspaceRole | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canRestoreVersions = canEdit(role ?? "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="version-history-title"
      onClose={onClose}
      onKeyDown={(event) => {
        closeDialogOnEscape(event, onClose);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-slate-900 backdrop:bg-slate-950/35 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(42rem,calc(100dvh-3rem))] sm:w-[min(36rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
    >
      <section className="flex h-full max-h-full flex-col overflow-y-auto bg-[#f7f8fa] shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <History size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="version-history-title" className="text-lg font-semibold tracking-tight">
                Version history
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Earlier saved document versions
              </p>
            </div>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close version history"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 px-5 py-6 sm:px-6 sm:py-8">
          <div
            role="status"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">
                <History size={17} aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold text-amber-950">
                  Version history is not available yet
                </h3>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  This document currently saves TipTap JSON. The existing
                  version storage supports binary Yjs snapshots only, so older
                  JSON versions cannot yet be safely listed or restored.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm leading-6 text-slate-600">
              Current editor autosave and revision checks continue to work
              normally. No history entries are being created or implied.
            </p>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            {canRestoreVersions
              ? "Restoring a version will be available to workspace owners and editors after JSON snapshot storage is implemented."
              : "Only workspace owners and editors will be allowed to restore versions when history is implemented."}
          </p>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-4 text-right sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
          >
            Close
          </button>
        </footer>
      </section>
    </dialog>
  );
}

type WorkspaceAccessMember = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

function isWorkspaceAccessMember(
  value: unknown,
): value is WorkspaceAccessMember {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || typeof value.id !== "string") return false;
  if (!("name" in value) || typeof value.name !== "string") return false;
  return (
    "role" in value &&
    (value.role === "OWNER" ||
      value.role === "EDITOR" ||
      value.role === "COMMENTER" ||
      value.role === "VIEWER")
  );
}

function DocumentAccessDialog({
  open,
  onClose,
  workspaceId,
  workspaceName,
  actorRole,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  actorRole: WorkspaceRole | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [members, setMembers] = useState<WorkspaceAccessMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    let active = true;

    async function loadMembers() {
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/members`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Could not load workspace access.",
          );
        }

        if (
          !Array.isArray(data.members) ||
          !data.members.every(isWorkspaceAccessMember)
        ) {
          throw new Error("Workspace access information is unavailable.");
        }

        if (active) {
          setMembers(data.members);
          setError("");
        }
      } catch (loadError) {
        if (!active || controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load workspace access. Please try again.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadMembers();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, open, workspaceId]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="document-access-title"
      onClose={onClose}
      onKeyDown={(event) => {
        closeDialogOnEscape(event, onClose);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-slate-900 backdrop:bg-slate-950/35 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(46rem,calc(100dvh-3rem))] sm:w-[min(42rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
    >
      <section className="flex h-full max-h-full flex-col overflow-hidden bg-[#f7f8fa] shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Users size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="document-access-title" className="text-lg font-semibold tracking-tight">
                Share and access
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                Workspace members for {workspaceName}
              </p>
            </div>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close share and access dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-indigo-700" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-indigo-950">
                  Access follows workspace membership
                </h3>
                <p className="mt-1 text-sm leading-6 text-indigo-900">
                  Members of <span className="font-semibold">{workspaceName}</span> can access this document. Their workspace role determines what they can do.
                </p>
              </div>
            </div>
          </div>

          {actorRole === "OWNER" && (
            <p className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
              To change a member&apos;s role or remove their access, use the workspace&apos;s existing Members controls.
              {" "}
              <Link
                href="/#workspaces"
                onClick={onClose}
                className="font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-indigo-700"
              >
                Go to workspace members
              </Link>
              .
            </p>
          )}

          <div className="mb-3 mt-6 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Workspace members
            </h3>
            {!loading && !error && (
              <span className="text-xs text-slate-500">
                {members.length} {members.length === 1 ? "member" : "members"}
              </span>
            )}
          </div>

          {loading ? (
            <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-10 text-sm text-slate-500">
              <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
              Loading workspace members...
            </div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-center text-sm text-rose-800">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setAttempt((current) => current + 1);
                }}
                className="mt-3 rounded-lg px-3 py-2 font-semibold text-rose-900 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-indigo-700"
              >
                Try again
              </button>
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
              <Users size={21} className="mx-auto text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-800">
                No workspace members found
              </p>
            </div>
          ) : (
            <ul aria-label={`Members of ${workspaceName}`} className="space-y-2">
              {members.map((member) => {
                const access = getRoleAccessDescription(member.role);
                const RoleIcon =
                  member.role === "VIEWER"
                    ? Eye
                    : member.role === "COMMENTER"
                      ? MessageSquare
                      : member.role === "OWNER"
                        ? ShieldCheck
                        : Users;

                return (
                  <li
                    key={member.id}
                    className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold uppercase text-slate-700">
                      {member.name.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {member.name}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <RoleIcon size={14} aria-hidden="true" />
                        {access.label}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {access.permissions}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-4 text-right sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
          >
            Close
          </button>
        </footer>
      </section>
    </dialog>
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

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
  const collaborationEnabled = isCollaborationOperationallyEnabled(
    process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
    process.env.NODE_ENV,
  );
  const editorMode = selectDocumentEditorMode(collaborationEnabled, role);
  const titleChanged = document !== null && title.trim() !== document.title;

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-7">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            <span>Workspace</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
            <span className="hidden text-slate-300 sm:inline">/</span>
            <FileText size={16} className="shrink-0 text-indigo-700" aria-hidden="true" />
            <span className="truncate">{document?.title || "Document"}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-7 sm:py-10">
        {loading ? (
          <div role="status" className="mx-auto max-w-4xl animate-pulse rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
            <div className="h-3 w-28 rounded bg-slate-100" />
            <div className="mt-5 h-9 w-2/3 rounded-lg bg-slate-100" />
            <div className="mt-4 h-4 w-1/3 rounded bg-slate-100" />
            <div className="mt-10 h-12 rounded-lg bg-slate-50" />
            <div className="mt-10 space-y-3">
              <div className="h-4 rounded bg-slate-100" />
              <div className="h-4 w-11/12 rounded bg-slate-100" />
              <div className="h-4 w-4/5 rounded bg-slate-100" />
            </div>
            <span className="sr-only">Loading document...</span>
          </div>
        ) : error && !document ? (
          <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-9">
            <h1 className="text-lg font-semibold">Document unavailable</h1>
            <p role="alert" className="mt-2 text-sm text-rose-700">
              {error}
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to workspace
            </Link>
          </section>
        ) : document ? (
          <>
            <div className="mb-7 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div className="min-w-0 flex-1">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-indigo-800">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50">
                    <FileText size={13} aria-hidden="true" />
                  </span>
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
                  className="w-full min-w-0 rounded-md border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight text-slate-950 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-300 sm:text-4xl disabled:text-slate-800"
                />
                <p className="mt-2 text-sm text-slate-500">
                  {editable ? "A space for your ideas and notes" : "Read-only access"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAccessOpen(true)}
                  aria-haspopup="dialog"
                  aria-label="Open sharing and access details"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                >
                  <Users size={16} aria-hidden="true" />
                  <span>Share / Access</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  aria-haspopup="dialog"
                  aria-label="Open version history"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                >
                  <History size={16} aria-hidden="true" />
                  History
                </button>
                {editable && (
                  <button
                    type="button"
                    onClick={() => void saveTitle()}
                    disabled={saving || !titleChanged || !title.trim()}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
            </div>

            {error && (
              <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </p>
            )}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_38px_-28px_rgba(15,23,42,0.32)]">
              {editorMode === "collaborative" ? (
                <CollaborativeRichTextEditor
                  key={document.id}
                  documentId={document.id}
                />
              ) : (
                <RichTextEditor
                  key={document.id}
                  documentId={document.id}
                  initialContent={document.content}
                  initialRevision={document.contentRevision}
                  editable={editable}
                />
              )}
            </section>
            <CommentsPanel documentId={document.id} role={role} />
            <VersionHistoryDialog
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              role={role}
            />
            {accessOpen && (
              <DocumentAccessDialog
                open={accessOpen}
                onClose={() => setAccessOpen(false)}
                workspaceId={document.workspace.id}
                workspaceName={document.workspace.name}
                actorRole={role}
              />
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}