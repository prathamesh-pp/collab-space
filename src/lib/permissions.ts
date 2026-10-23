export type WorkspaceRole = "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER";

export function canEdit(role: string): role is "OWNER" | "EDITOR" {
  return role === "OWNER" || role === "EDITOR";
}

export function canComment(role: string): boolean {
  return canEdit(role) || role === "COMMENTER";
}