"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  searchDashboard,
  type DashboardSearchFilter,
} from "@/lib/dashboard-search";
import { CreateDocumentDialog } from "./create-document-dialog";
import { getRecentDocuments } from "@/lib/recent-documents";
import {
  recordOpenedDocument,
  useRecentDocuments,
} from "@/lib/use-recent-documents";
import { closeDialogOnEscape } from "@/lib/dialog-accessibility";

type DocumentItem = {
  id: string;
  title: string;
  updatedAt?: string;
};

type Workspace = {
  id: string;
  name: string;
  role?: "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER";
  members?: { role: "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER" }[];
  documents?: DocumentItem[];
};

type WorkspaceMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER";
  createdAt: string;
};

type User = {
  id: string;
  name: string;
  email: string;
};

function WorkspaceMembersDialog({
  workspace,
  userId,
  onClose,
}: {
  workspace: Workspace;
  userId: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isOwner = workspace.role === "OWNER";

  const requestMembers = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(
      `/api/workspaces/${workspace.id}/members`,
      { signal },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not load workspace members.");
    }
    return data as { members: WorkspaceMember[] };
  }, [workspace.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();

    const controller = new AbortController();
    async function load() {
      try {
        const data = await requestMembers(controller.signal);
        if (controller.signal.aborted) return;
        setError("");
        setMembers(data.members);
        setDraftRoles(
          Object.fromEntries(
            data.members.map((member) => [member.userId, member.role]),
          ),
        );
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load workspace members. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [requestMembers]);

  async function refreshMembers() {
    try {
      const data = await requestMembers();
      setMembers(data.members);
      setDraftRoles(
        Object.fromEntries(
          data.members.map((member) => [member.userId, member.role]),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to refresh workspace members.",
      );
    }
  }

  async function changeRole(member: WorkspaceMember) {
    const role = draftRoles[member.userId];
    if (!role || role === member.role) return;
    setBusyUserId(member.userId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/workspaces/${workspace.id}/members/${member.userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not update this member's role.");
      }
      setNotice(`Updated ${member.name}'s role.`);
      await refreshMembers();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update this member. Please try again.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(member: WorkspaceMember) {
    if (!window.confirm(`Remove ${member.name} from ${workspace.name}?`)) return;

    setBusyUserId(member.userId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/workspaces/${workspace.id}/members/${member.userId}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove this member.");
      }
      setNotice(`Removed ${member.name} from the workspace.`);
      await refreshMembers();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove this member. Please try again.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="workspace-members-title"
      onClose={onClose}
      onKeyDown={(event) => {
        closeDialogOnEscape(event, onClose);
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-slate-900 backdrop:bg-slate-950/35 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(44rem,calc(100dvh-3rem))] sm:w-[min(44rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
    >
      <section className="flex h-full max-h-full flex-col overflow-hidden bg-[#f7f8fa] shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Users size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="workspace-members-title" className="truncate text-lg font-semibold tracking-tight">
                Members
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">{workspace.name}</p>
            </div>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close workspace members"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p role="alert">{error}</p>
              {members.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setError("");
                    void refreshMembers().finally(() => setLoading(false));
                  }}
                  className="mt-2 font-semibold text-rose-900 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-indigo-700"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {notice && (
            <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {notice}
            </p>
          )}

          {loading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
              Loading members...
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
              <Users size={22} className="mx-auto text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-800">No members found</p>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="Workspace members">
              {members.map((member) => {
                const isSelf = member.userId === userId;
                const busy = busyUserId === member.userId;
                const changedRole = draftRoles[member.userId] !== member.role;
                return (
                  <li
                    key={member.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-800">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {member.name}
                          {isSelf && <span className="ml-2 text-xs font-medium text-slate-500">(you)</span>}
                        </p>
                        <p className="break-all text-xs text-slate-500">{member.email}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0 sm:justify-end">
                      {isOwner && !isSelf ? (
                        <>
                          <label className="sr-only" htmlFor={`member-role-${member.userId}`}>
                            Role for {member.name}
                          </label>
                          <select
                            id={`member-role-${member.userId}`}
                            value={draftRoles[member.userId] ?? member.role}
                            onChange={(event) =>
                              setDraftRoles((current) => ({
                                ...current,
                                [member.userId]: event.target.value,
                              }))
                            }
                            disabled={busy}
                            className="h-9 min-w-32 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                          >
                            {member.role === "OWNER" && (
                              <option value="OWNER">Owner</option>
                            )}
                            <option value="EDITOR">Editor</option>
                            <option value="COMMENTER">Commenter</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => void changeRole(member)}
                            disabled={busy || !changedRole || draftRoles[member.userId] === "OWNER"}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-700 px-3 text-xs font-semibold text-white transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {busy ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeMember(member)}
                            disabled={busy}
                            aria-label={`Remove ${member.name}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-indigo-700 disabled:opacity-50"
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          {member.role === "OWNER" && <ShieldCheck size={13} aria-hidden="true" />}
                          {member.role}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
          <p className="text-xs text-slate-500">
            {isOwner
              ? "Owners can manage roles and remove members. Owner access cannot be granted here."
              : "Only workspace owners can change roles or remove members."}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
          >
            Done
          </button>
        </footer>
      </section>
    </dialog>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [membersWorkspace, setMembersWorkspace] = useState<Workspace | null>(null);
  const [documentWorkspace, setDocumentWorkspace] = useState<Workspace | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<DashboardSearchFilter>("all");
  const userId = user?.id;
  const recentDocumentRecords = useRecentDocuments(userId);
  const authorizedDocuments = useMemo(
    () =>
      workspaces.flatMap((workspace) =>
        (workspace.documents ?? []).map((document) => ({
          ...document,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        })),
      ),
    [workspaces],
  );
  const recentDocuments = useMemo(
    () => getRecentDocuments(recentDocumentRecords, authorizedDocuments),
    [authorizedDocuments, recentDocumentRecords],
  );
  const searchResults = useMemo(
    () => searchDashboard(workspaces, searchQuery, searchFilter),
    [workspaces, searchQuery, searchFilter],
  );
  const hasSearch = searchQuery.trim().length > 0 || searchFilter !== "all";
  const hasSearchResults =
    searchResults.workspaces.length > 0 || searchResults.documents.length > 0;

  const loadWorkspaces = useCallback(async () => {
    try {
      const response = await fetch("/api/workspaces");
      if (!response.ok) {
        if (response.status === 401) {
          setUser(null);
          setWorkspaces([]);
        } else {
          setError("Could not load workspaces. Please try again.");
        }
        return;
      }

      const data = await response.json();
      setWorkspaces(
        (data.workspaces ?? []).map((workspace: Workspace) => ({
          ...workspace,
          role:
            workspace.role ??
            workspace.members?.[0]?.role ??
            "VIEWER",
        })),
      );
    } catch {
      setError("Unable to connect to the server. Please try again.");
    }
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/me");
        if (response.status === 401) {
          setUser(null);
          setWorkspaces([]);
          return;
        }
        if (!response.ok) {
          setError("Unable to restore your session. Please try again.");
          return;
        }

        const data = await response.json();
        if (!data.user) {
          setError("Unable to restore your session. Please try again.");
          return;
        }

        setUser(data.user);
        await loadWorkspaces();
      } catch {
        setError("Unable to connect to the server. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    void restoreSession();
  }, [loadWorkspaces]);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const endpoint =
        authMode === "login"
          ? "/api/auth/login"
          : "/api/auth/register";

      const body =
        authMode === "login"
          ? { email, password }
          : { name, email, password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Authentication failed.");
        return;
      }

      setUser(data.user);
      setPassword("");
      setLoading(true);
      await loadWorkspaces();
      setLoading(false);
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Could not sign out. Please try again.");
        return;
      }

      setUser(null);
      setWorkspaces([]);
      setAuthMode("login");
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (workspaceName.trim().length < 2) {
      setError("Workspace name must contain at least 2 characters.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not create workspace.");
        return;
      }

      setWorkspaceName("");
      await loadWorkspaces();
    } catch {
      setError("Unable to create workspace. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createDocument(workspaceId: string, title: string) {
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not create document.");
      }

      await loadWorkspaces();
    } catch (createError) {
      throw createError instanceof Error
        ? createError
        : new Error("Unable to create document. Please try again.");
    }
  }

  function handleDocumentOpen(documentId: string) {
    if (userId) {
      recordOpenedDocument(userId, recentDocumentRecords, documentId);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] text-slate-600">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <span className="text-sm font-medium">Loading your workspace...</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f5f8] px-4 py-10 sm:px-6">
        <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.3)] lg:grid-cols-[1fr_0.9fr]">
          <div className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[#202b4a] p-12 text-white lg:flex">
            <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full border border-white/10" />
            <div className="absolute -right-4 top-16 h-56 w-56 rounded-full border border-white/10" />
            <div className="absolute -bottom-36 -left-28 h-96 w-96 rounded-full bg-indigo-400/15 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-indigo-700">
                <LayoutDashboard size={20} aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold tracking-tight">CollabSpace</span>
            </div>
            <div className="relative max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
                A calmer place to work
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">
                Bring your team&apos;s best thinking together.
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-300">
                Keep projects, notes, and important documents organized in one shared space.
              </p>
            </div>
            <p className="relative text-xs text-slate-400">
              Thoughtful work, made a little simpler.
            </p>
          </div>

          <div className="px-6 py-9 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-700 text-white shadow-sm">
                  <LayoutDashboard size={20} aria-hidden="true" />
                </span>
                <span className="text-lg font-semibold tracking-tight text-slate-900">
                  CollabSpace
                </span>
              </div>
            </div>
            <div className="mb-8">
              <p className="text-sm font-semibold text-indigo-700">
                {authMode === "login" ? "Welcome back" : "Get started"}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {authMode === "login" ? "Sign in to your space" : "Create your account"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {authMode === "login"
                  ? "Pick up where you left off with your team."
                  : "Set up a home for your team’s work."}
              </p>
            </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              aria-pressed={authMode === "login"}
              onClick={() => {
                setAuthMode("login");
                setError("");
              }}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                authMode === "login"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={authMode === "register"}
              onClick={() => {
                setAuthMode("register");
                setError("");
              }}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                authMode === "register"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            {authMode === "register" && (
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-semibold text-slate-700">
                  Full name
                </label>
                <input
                  id="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                aria-describedby={authMode === "register" ? "password-help" : undefined}
                required
                minLength={authMode === "register" ? 10 : 1}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={authMode === "register" ? "At least 10 characters" : "Your password"}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
              {authMode === "register" && (
                <p id="password-help" className="mt-2 text-xs leading-5 text-slate-500">
                  Use at least 10 characters and no more than 72 UTF-8 bytes.
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
              {!busy && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900 lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200/80 bg-white px-4 py-6 lg:flex lg:flex-col">
        <Link href="/" className="mb-9 flex items-center gap-3 rounded-xl px-2 py-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-700 text-white shadow-sm">
            <LayoutDashboard size={19} aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight">CollabSpace</span>
        </Link>
        <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Workspace
        </p>
        <nav aria-label="Main navigation" className="space-y-1">
          <a
            href="#overview"
            aria-current="page"
            className="flex items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-800"
          >
            <LayoutDashboard size={17} aria-hidden="true" />
            Overview
          </a>
          <a
            href="#workspaces"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            <FolderOpen size={17} aria-hidden="true" />
            Your spaces
          </a>
          <a
            href="#recent-documents"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            <Clock3 size={17} aria-hidden="true" />
            Recent documents
          </a>
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-4">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-800">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={busy}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50"
            >
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-700 text-white">
                <LayoutDashboard size={18} aria-hidden="true" />
              </span>
              <span className="font-semibold tracking-tight">CollabSpace</span>
            </Link>
            <p className="hidden text-sm font-medium text-slate-500 lg:block">
              Workspace overview
            </p>
            <div className="flex items-center gap-3 lg:hidden">
              <span className="hidden text-right sm:block">
                <span className="block text-sm font-semibold text-slate-800">{user.name}</span>
                <span className="block text-xs text-slate-500">{user.email}</span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50"
              >
                <LogOut size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <nav
          aria-label="Dashboard sections"
          className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden"
        >
          <a
            href="#overview"
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            Overview
          </a>
          <a
            href="#recent-documents"
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            Recent documents
          </a>
          <a
            href="#workspaces"
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-700"
          >
            Your spaces
          </a>
        </nav>

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10 lg:px-10">
          <section id="overview" className="mb-9 flex flex-col gap-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-white to-indigo-50/70 p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">
                Your workspace
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Welcome back, {user.name.split(" ")[0]}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                A clear view of the spaces and documents your team is working on.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-white bg-white/80 px-4 py-3 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <Users size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-semibold leading-5 text-slate-900">{workspaces.length}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {workspaces.length === 1 ? "workspace" : "workspaces"}
                </p>
              </div>
            </div>
          </section>

          {error && (
            <p role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </p>
          )}

          <section
            id="recent-documents"
            aria-labelledby="recent-documents-heading"
            className="mb-9 scroll-mt-24"
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">
                  Pick up where you left off
                </p>
                <h2
                  id="recent-documents-heading"
                  className="mt-1 text-xl font-semibold tracking-tight text-slate-950"
                >
                  Recent documents
                </h2>
              </div>
              {recentDocuments.length > 0 && (
                <span className="text-xs text-slate-500">
                  Saved in this browser
                </span>
              )}
            </div>
            {recentDocuments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-7 sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                    <Clock3 size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Your recent documents will show up here
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Open a document to add it. Only document references and
                      open times are stored in this browser.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {recentDocuments.map(({ document, openedAt }) => (
                  <li key={document.id}>
                    <Link
                      href={`/documents/${document.id}`}
                      onClick={() => handleDocumentOpen(document.id)}
                      className="group flex h-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-100">
                        <FileText size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {document.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {document.workspaceName}
                        </span>
                        <span className="mt-1.5 block text-[11px] text-slate-400">
                          Opened{" "}
                          {new Date(openedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </span>
                      <ArrowRight
                        size={16}
                        aria-hidden="true"
                        className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Plus size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Create a workspace</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Start a dedicated space for a project or team.
                </p>
              </div>
            </div>
            <form onSubmit={createWorkspace} className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="workspace-name" className="sr-only">Workspace name</label>
              <input
                id="workspace-name"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="e.g. Product launch"
                minLength={2}
                maxLength={60}
                required
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={17} aria-hidden="true" />
                New workspace
              </button>
            </form>
          </section>

          <section
            aria-label="Search workspaces and documents"
            className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <label htmlFor="dashboard-search" className="sr-only">
              Search workspaces and documents
            </label>
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3.5 transition focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100">
              <Search size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
              <input
                id="dashboard-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search your spaces and documents..."
                autoComplete="off"
                className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-700"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Search result type" className="flex flex-wrap gap-1.5">
                {([
                  ["all", "All"],
                  ["workspaces", "Workspaces"],
                  ["documents", "Documents"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={searchFilter === value}
                    onClick={() => setSearchFilter(value)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 ${
                      searchFilter === value
                        ? "bg-indigo-100 text-indigo-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {hasSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchFilter("all");
                  }}
                  className="text-xs font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-indigo-700"
                >
                  Reset search
                </button>
              )}
            </div>
          </section>

          <div id="workspaces" className="scroll-mt-24" />
          {searchFilter !== "documents" && (
          <section aria-labelledby="workspaces-heading">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="workspaces-heading" className="text-xl font-semibold tracking-tight text-slate-950">
                  {searchQuery.trim() ? "Matching workspaces" : "Your spaces"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Projects and documents shared with you.
                </p>
              </div>
              <span className="text-sm font-medium text-slate-500">
                {searchResults.workspaces.length} {searchResults.workspaces.length === 1 ? "space" : "spaces"}
              </span>
            </div>

            {workspaces.length === 0 && !hasSearch ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                  <FolderOpen size={22} aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">Your first space starts here</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  Create a workspace above to bring a project and its documents together.
                </p>
              </div>
            ) : searchResults.workspaces.length === 0 ? null : (
              <div className="grid gap-5 md:grid-cols-2">
                {searchResults.workspaces.map((workspace) => (
                  <section
                    key={workspace.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5 sm:flex-nowrap sm:p-6">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                          <FolderOpen size={19} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-slate-900">{workspace.name}</h3>
                          <span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {workspace.role ?? "Member"}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDocumentWorkspace(workspace)}
                          aria-haspopup="dialog"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                        >
                          <Plus size={15} aria-hidden="true" />
                          Document
                        </button>
                        <button
                          type="button"
                          onClick={() => setMembersWorkspace(workspace)}
                          aria-label={`View members of ${workspace.name}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                        >
                          <Users size={15} aria-hidden="true" />
                          <span className="hidden sm:inline">Members</span>
                        </button>
                      </div>
                    </div>
                    <div className="p-5 sm:p-6">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Documents</p>
                        <span className="text-xs text-slate-400">{workspace.documents?.length ?? 0}</span>
                      </div>
                      {workspace.documents?.length ? (
                        <ul className="space-y-1.5">
                          {workspace.documents.map((document) => (
                            <li key={document.id}>
                              <Link
                                href={`/documents/${document.id}`}
                                onClick={() => handleDocumentOpen(document.id)}
                                className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-700"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition group-hover:border-indigo-100 group-hover:text-indigo-700">
                                  <FileText size={17} aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 group-hover:text-slate-950">{document.title}</span>
                                <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="rounded-xl bg-slate-50 px-4 py-5 text-center">
                          <p className="text-sm text-slate-600">No documents in this space yet.</p>
                          <button
                            type="button"
                            onClick={() => setDocumentWorkspace(workspace)}
                            aria-haspopup="dialog"
                            className="mt-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                          >
                            Create the first document
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
          )}

          {(searchFilter === "documents" || searchQuery.trim()) &&
            searchFilter !== "workspaces" && (
              <section
                aria-labelledby="matching-documents-heading"
                className={searchFilter === "documents" ? "" : "mt-9"}
              >
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2 id="matching-documents-heading" className="text-xl font-semibold tracking-tight text-slate-950">
                      {searchQuery.trim() ? "Matching documents" : "Your documents"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">Documents in your workspaces.</p>
                  </div>
                  <span className="text-sm font-medium text-slate-500">
                    {searchResults.documents.length} {searchResults.documents.length === 1 ? "document" : "documents"}
                  </span>
                </div>
                {searchResults.documents.length > 0 && (
                  <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm sm:px-5">
                    {searchResults.documents.map((document) => (
                      <li key={document.id}>
                        <Link
                          href={`/documents/${document.id}`}
                          onClick={() => handleDocumentOpen(document.id)}
                          className="group flex min-w-0 items-center gap-3 rounded-xl px-2 py-3.5 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-700 sm:px-3"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 group-hover:border-indigo-100 group-hover:text-indigo-700">
                            <FileText size={17} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-indigo-800">
                              {document.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {document.workspaceName}
                            </span>
                          </span>
                          <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-slate-300 group-hover:text-indigo-600" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

          {hasSearch && !hasSearchResults && (
            <div role="status" className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <Search size={22} className="mx-auto text-slate-400" aria-hidden="true" />
              <h2 className="mt-3 font-semibold text-slate-900">No matches found</h2>
              <p className="mt-1 text-sm text-slate-500">
                Try another name or title, or reset the search filters.
              </p>
            </div>
          )}

        </div>
      </div>
      {membersWorkspace && user && (
        <WorkspaceMembersDialog
          key={membersWorkspace.id}
          workspace={membersWorkspace}
          userId={user.id}
          onClose={() => setMembersWorkspace(null)}
        />
      )}
      {documentWorkspace && (
        <CreateDocumentDialog
          key={documentWorkspace.id}
          workspaceName={documentWorkspace.name}
          onClose={() => setDocumentWorkspace(null)}
          onCreate={(title) => createDocument(documentWorkspace.id, title)}
        />
      )}
    </main>
  );
}
