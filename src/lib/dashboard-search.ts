export type DashboardSearchDocument = {
  id: string;
  title: string;
};

export type DashboardSearchWorkspace = {
  id: string;
  name: string;
  documents?: DashboardSearchDocument[];
};

export type DashboardSearchFilter = "all" | "workspaces" | "documents";

export type DashboardSearchResult = {
  workspaces: DashboardSearchWorkspace[];
  documents: Array<DashboardSearchDocument & {
    workspaceId: string;
    workspaceName: string;
  }>;
};

export function searchDashboard<
  TDocument extends DashboardSearchDocument,
  TWorkspace extends {
    id: string;
    name: string;
    documents?: TDocument[];
  },
>(
  workspaces: TWorkspace[],
  query: string,
  filter: DashboardSearchFilter,
): {
  workspaces: TWorkspace[];
  documents: Array<TDocument & {
    workspaceId: string;
    workspaceName: string;
  }>;
} {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (value: string) =>
    !normalizedQuery || value.toLocaleLowerCase().includes(normalizedQuery);

  return {
    workspaces:
      filter === "documents"
        ? []
        : workspaces.filter((workspace) => matches(workspace.name)),
    documents:
      filter === "workspaces"
        ? []
        : workspaces.flatMap((workspace) =>
            (workspace.documents ?? [])
              .filter((document) =>
                normalizedQuery ? matches(document.title) : filter === "documents",
              )
              .map((document) => ({
                ...document,
                workspaceId: workspace.id,
                workspaceName: workspace.name,
              })),
          ),
  };
}
