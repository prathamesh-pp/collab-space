"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type DocumentItem = {
  id: string;
  title: string;
  updatedAt?: string;
};

type Workspace = {
  id: string;
  name: string;
  role?: string;
  members?: unknown[];
  documents?: DocumentItem[];
};

type User = {
  id: string;
  name: string;
  email: string;
};

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
      setWorkspaces(data.workspaces ?? []);
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

  async function createDocument(workspaceId: string) {
    const title = window.prompt("Enter a document title:", "Untitled");
    if (title === null) return;

    if (!title.trim()) {
      setError("Document title cannot be empty.");
      return;
    }

    setError("");

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not create document.");
        return;
      }

      await loadWorkspaces();
    } catch {
      setError("Unable to create document. Please try again.");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading CollabSpace...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
              C
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              CollabSpace
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Your team&apos;s space to think, write, and collaborate.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setError("");
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                authMode === "login"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setError("");
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                authMode === "register"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === "register" && (
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                required
                minLength={authMode === "register" ? 10 : 1}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={authMode === "register" ? "At least 10 characters" : "Your password"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            A simple workspace for ideas and teamwork.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">
              C
            </div>
            <span className="text-lg font-bold text-slate-900">CollabSpace</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8">
          <p className="text-sm font-medium text-indigo-600">YOUR WORKSPACE</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Welcome back, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-slate-500">
            Organize your documents and keep your team’s work together.
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Create a workspace</h2>
          <form onSubmit={createWorkspace} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="e.g. College Project Team"
              minLength={2}
              maxLength={60}
              required
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              + New workspace
            </button>
          </form>
        </section>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Your workspaces</h2>
          <span className="text-sm text-slate-500">
            {workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}
          </span>
        </div>

        {workspaces.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <h3 className="font-semibold text-slate-800">No workspaces yet</h3>
            <p className="mt-2 text-sm text-slate-500">
              Create a workspace above to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {workspaces.map((workspace) => (
              <section
                key={workspace.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex items-start justify-between border-b border-slate-100 p-5">
                  <div>
                    <h3 className="font-semibold text-slate-900">{workspace.name}</h3>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {workspace.role ?? "Member"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => createDocument(workspace.id)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    + Document
                  </button>
                </div>

                <div className="p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Documents
                  </p>

                  {workspace.documents?.length ? (
                    <ul className="space-y-2">
                      {workspace.documents.map((document) => (
                        <li
                          key={document.id}
                          className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              className="h-5 w-5"
                            >
                              <path d="M7 3.75h7l4 4v12.5H7z" />
                              <path d="M14 3.75v4h4M10 12h5M10 15.5h5" />
                            </svg>
                          </span>
                          <Link
                            href={`/documents/${document.id}`}
                            className="min-w-0 truncate text-sm font-medium text-slate-700 hover:text-indigo-700 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
                          >
                            {document.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-3 text-sm text-slate-500">
                      No documents yet. Create your first one.
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
