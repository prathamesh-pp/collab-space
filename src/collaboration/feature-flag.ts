export function isCollaborationFeatureEnabled(
  enabled: string | undefined,
  nodeEnvironment: string | undefined,
): boolean {
  return enabled === "true" &&
    (nodeEnvironment === "development" || nodeEnvironment === "production");
}

export function isCollaborationOperationallyEnabled(
  enabled: string | undefined,
  nodeEnvironment: string | undefined,
): boolean {
  return isCollaborationFeatureEnabled(enabled, nodeEnvironment);
}

export function isClientCollaborationConfigured(
  enabled: string | undefined,
  nodeEnvironment: string | undefined,
  websocketUrl: string | undefined,
): boolean {
  if (!isCollaborationOperationallyEnabled(enabled, nodeEnvironment) || !websocketUrl) {
    return false;
  }

  try {
    const url = new URL(websocketUrl);
    return (url.protocol === "ws:" || url.protocol === "wss:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function selectDocumentEditorMode(
  collaborationEnabled: boolean,
  role: string | null,
): "collaborative" | "legacy" {
  return collaborationEnabled && (role === "OWNER" || role === "EDITOR")
    ? "collaborative"
    : "legacy";
}
