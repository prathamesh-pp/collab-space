import { z } from "zod";

const MAX_CONTENT_DEPTH = 64;
const MAX_CONTENT_NODES = 12_000;
const MAX_CONTENT_TEXT_LENGTH = 300_000;

type Mark = { type: "bold" | "italic" };
type TextNode = { type: "text"; text: string; marks?: Mark[] };
type HardBreakNode = { type: "hardBreak"; marks?: Mark[] };
type InlineNode = TextNode | HardBreakNode;
type ParagraphNode = { type: "paragraph"; content?: InlineNode[] };
type HeadingNode = {
  type: "heading";
  attrs: { level: number };
  content?: InlineNode[];
};
type ListItemNode = { type: "listItem"; content: BlockNode[] };
type BulletListNode = { type: "bulletList"; content: ListItemNode[] };
type OrderedListNode = {
  type: "orderedList";
  attrs?: { start?: number; type?: "1" | "a" | "A" | "i" | "I" | null };
  content: ListItemNode[];
};
type ListNode = BulletListNode | OrderedListNode;
type BlockNode = ParagraphNode | HeadingNode | ListNode;
export type DocumentContent = { type: "doc"; content: BlockNode[] };

type ValidationState = { nodeCount: number; textLength: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function countNode(state: ValidationState, depth: number): boolean {
  state.nodeCount += 1;
  return state.nodeCount <= MAX_CONTENT_NODES && depth <= MAX_CONTENT_DEPTH;
}

function validateMarks(value: unknown): value is Mark[] | undefined {
  if (value === undefined) return true;
  return Array.isArray(value) && value.length <= 2 && value.every((mark) =>
    isRecord(mark) &&
    hasOnlyKeys(mark, ["type"]) &&
    (mark.type === "bold" || mark.type === "italic"),
  );
}

function validateInline(
  value: unknown,
  state: ValidationState,
  depth: number,
): value is InlineNode {
  if (!countNode(state, depth) || !isRecord(value)) return false;
  if (value.type === "text") {
    if (!hasOnlyKeys(value, ["type", "text"], ["marks"]) ||
      typeof value.text !== "string" || value.text.length === 0 ||
      !validateMarks(value.marks)) return false;
    state.textLength += value.text.length;
    return state.textLength <= MAX_CONTENT_TEXT_LENGTH;
  }
  return value.type === "hardBreak" &&
    hasOnlyKeys(value, ["type"], ["marks"]) &&
    validateMarks(value.marks);
}

function validateInlineContent(
  value: unknown,
  state: ValidationState,
  depth: number,
): value is InlineNode[] | undefined {
  if (value === undefined) return true;
  return Array.isArray(value) && value.length <= 10_000 &&
    value.every((node) => validateInline(node, state, depth + 1));
}

function validateListItem(
  value: unknown,
  state: ValidationState,
  depth: number,
): value is ListItemNode {
  if (!countNode(state, depth) || !isRecord(value) ||
    !hasOnlyKeys(value, ["type", "content"]) || value.type !== "listItem" ||
    !Array.isArray(value.content) || value.content.length === 0 ||
    value.content.length > 100) return false;
  return value.content.every((node) => validateBlock(node, state, depth + 1));
}

function validateList(
  value: Record<string, unknown>,
  state: ValidationState,
  depth: number,
): value is ListNode {
  if (!Array.isArray(value.content) || value.content.length === 0 ||
    value.content.length > 1_000 ||
    !value.content.every((item) => validateListItem(item, state, depth + 1))) return false;

  if (value.type === "bulletList") {
    return hasOnlyKeys(value, ["type", "content"]);
  }
  if (value.type !== "orderedList" ||
    !hasOnlyKeys(value, ["type", "content"], ["attrs"])) return false;
  if (value.attrs === undefined) return true;
  if (!isRecord(value.attrs) || !hasOnlyKeys(value.attrs, [], ["start", "type"])) return false;
  const { start, type } = value.attrs;
  return (start === undefined ||
      (typeof start === "number" && Number.isInteger(start) && start >= 1 && start <= 100_000)) &&
    (type === undefined || type === null ||
      (typeof type === "string" && ["1", "a", "A", "i", "I"].includes(type)));
}

function validateBlock(
  value: unknown,
  state: ValidationState,
  depth: number,
): value is BlockNode {
  if (!countNode(state, depth) || !isRecord(value)) return false;
  if (value.type === "paragraph") {
    return hasOnlyKeys(value, ["type"], ["content"]) &&
      validateInlineContent(value.content, state, depth);
  }
  if (value.type === "heading") {
    return hasOnlyKeys(value, ["type", "attrs"], ["content"]) &&
      isRecord(value.attrs) && hasOnlyKeys(value.attrs, ["level"]) &&
      typeof value.attrs.level === "number" && Number.isInteger(value.attrs.level) &&
      value.attrs.level >= 1 && value.attrs.level <= 6 &&
      validateInlineContent(value.content, state, depth);
  }
  return (value.type === "bulletList" || value.type === "orderedList") &&
    validateList(value, state, depth);
}

function isDocumentContent(value: unknown): value is DocumentContent {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "content"]) ||
    value.type !== "doc" || !Array.isArray(value.content) ||
    value.content.length === 0 || value.content.length > 3_000) return false;

  const state = { nodeCount: 0, textLength: 0 };
  if (!countNode(state, 0)) return false;
  return value.content.every((node) => validateBlock(node, state, 1));
}

export const documentContentSchema = z.custom<DocumentContent>(isDocumentContent);

export function parseDocumentContent(value: unknown): DocumentContent | null {
  const parsed = documentContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}