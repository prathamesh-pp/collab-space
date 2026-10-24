import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

export const COLLABORATION_FRAGMENT = "default";

export const collaborationSchema = getSchema([
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    strike: false,
    underline: false,
  }),
]);
