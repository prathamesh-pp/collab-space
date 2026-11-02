import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import type { Doc } from "yjs";
import { COLLABORATION_FRAGMENT } from "@/collaboration/tiptap-schema";
import type { CollaborationProviderLifecycle } from "@/collaboration/client";
import { getPresenceColor } from "@/collaboration/presence-identity";

export function createCollaborativeEditorExtensions(
  provider: CollaborationProviderLifecycle,
  yDocument: Doc,
  user: { id: string; name: string },
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
      document: yDocument,
      field: COLLABORATION_FRAGMENT,
      provider,
    }),
    CollaborationCaret.configure({
      provider,
      user: { name: user.name, color: getPresenceColor(user.id) },
      render: (presenceUser) => {
        const color = typeof presenceUser.color === "string" ? presenceUser.color : "#334155";
        const name = typeof presenceUser.name === "string" ? presenceUser.name : "Collaborator";
        const caret = window.document.createElement("span");
        caret.className = "collabry-cursor";
        caret.style.borderColor = color;
        caret.title = name;
        caret.setAttribute("aria-label", `${name}'s cursor`);
        const label = window.document.createElement("span");
        label.className = "collabry-cursor-label";
        label.style.backgroundColor = color;
        label.textContent = name;
        caret.append(label);
        return caret;
      },
      selectionRender: (presenceUser) => ({
        class: "collabry-selection",
        style: `background-color: ${String(presenceUser.color ?? "#334155")}33`,
        "data-collaborator": String(presenceUser.name ?? "Collaborator"),
      }),
    }),
    Placeholder.configure({ placeholder: "Start writing..." }),
  ];
}
