import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import type { Doc } from "yjs";
import { COLLABORATION_FRAGMENT } from "@/collaboration/tiptap-schema";
import type { CollaborationProviderLifecycle } from "@/collaboration/client";

export function createCollaborativeEditorExtensions(
  provider: CollaborationProviderLifecycle,
  document: Doc,
) {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      strike: false,
      underline: false,
      undoRedo: false,
    }),
    Collaboration.configure({
      document,
      field: COLLABORATION_FRAGMENT,
      provider,
    }),
    Placeholder.configure({ placeholder: "Start writing..." }),
  ];
}
