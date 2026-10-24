"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  parseRecentDocuments,
  recordRecentDocument,
  type RecentDocumentRecord,
} from "@/lib/recent-documents";

const storagePrefix = "collab-space:recent-documents:v1:";
const subscribers = new Map<string, Set<() => void>>();
const memorySnapshots = new Map<string, string>();

function getStorageKey(userId: string) {
  return `${storagePrefix}${userId}`;
}

function getSnapshot(userId: string | undefined) {
  if (!userId) return "";

  const key = getStorageKey(userId);
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return memorySnapshots.get(key) ?? "";
  }
}

function subscribe(userId: string | undefined, onChange: () => void) {
  if (!userId) return () => {};

  const key = getStorageKey(userId);
  const listeners = subscribers.get(key) ?? new Set<() => void>();
  listeners.add(onChange);
  subscribers.set(key, listeners);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) onChange();
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) subscribers.delete(key);
    window.removeEventListener("storage", handleStorage);
  };
}

function getServerSnapshot() {
  return "";
}

export function useRecentDocuments(userId: string | undefined) {
  const subscribeToUser = useCallback(
    (onChange: () => void) => subscribe(userId, onChange),
    [userId],
  );
  const getUserSnapshot = useCallback(
    () => getSnapshot(userId),
    [userId],
  );
  const serialized = useSyncExternalStore(
    subscribeToUser,
    getUserSnapshot,
    getServerSnapshot,
  );

  return useMemo(() => parseRecentDocuments(serialized), [serialized]);
}

export function recordOpenedDocument(
  userId: string,
  records: RecentDocumentRecord[],
  documentId: string,
) {
  const nextRecords = recordRecentDocument(records, documentId, Date.now());
  const key = getStorageKey(userId);
  const serialized = JSON.stringify(nextRecords);
  memorySnapshots.set(key, serialized);

  try {
    window.localStorage.setItem(key, serialized);
  } catch {
    console.warn("Recent document history could not be saved in this browser.");
  }

  for (const onChange of subscribers.get(key) ?? []) onChange();
}
