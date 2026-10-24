export type DocumentSaveStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "error"
  | "conflict";

export type EditableDocumentEditor = {
  setEditable(editable: boolean): void;
};

export function syncDocumentEditorEditability(
  editor: EditableDocumentEditor | null,
  canEdit: boolean,
  saveStatus: DocumentSaveStatus,
) {
  editor?.setEditable(canEdit && saveStatus !== "conflict");
}
