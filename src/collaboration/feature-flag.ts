// Hocuspocus v3.1.1 detaches debounced store failures from the update callback.
const COLLABORATION_PERSISTENCE_FAILURE_REPORTING_READY = false;

export function isCollaborationFeatureEnabled(
  enabled: string | undefined,
  nodeEnvironment: string | undefined,
): boolean {
  return enabled === "true" && nodeEnvironment === "development";
}

export function isCollaborationOperationallyEnabled(
  enabled: string | undefined,
  nodeEnvironment: string | undefined,
): boolean {
  return (
    COLLABORATION_PERSISTENCE_FAILURE_REPORTING_READY &&
    isCollaborationFeatureEnabled(enabled, nodeEnvironment)
  );
}

export function selectDocumentEditorMode(
  collaborationEnabled: boolean,
  role: string | null,
): "collaborative" | "legacy" {
  return collaborationEnabled && (role === "OWNER" || role === "EDITOR")
    ? "collaborative"
    : "legacy";
}
