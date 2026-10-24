import type { WorkspaceRole } from "@/lib/permissions";

export type RoleAccessDescription = {
  label: string;
  permissions: string;
};

const roleAccessDescriptions: Record<WorkspaceRole, RoleAccessDescription> = {
  OWNER: {
    label: "Owner",
    permissions: "Can edit this document and manage workspace members.",
  },
  EDITOR: {
    label: "Editor",
    permissions: "Can edit this document.",
  },
  COMMENTER: {
    label: "Commenter",
    permissions: "Can read and comment, but cannot edit this document.",
  },
  VIEWER: {
    label: "Viewer",
    permissions: "Can read this document only.",
  },
};

export function getRoleAccessDescription(
  role: WorkspaceRole,
): RoleAccessDescription {
  return roleAccessDescriptions[role];
}
