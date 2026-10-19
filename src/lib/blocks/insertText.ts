import type { ChainedCommands, Editor, JSONContent } from "@tiptap/react";
import type { Node, ResolvedPos } from "@tiptap/pm/model";
import { canJoin } from "@tiptap/pm/transform";

// Plain text from a Text Block going into the resume. Text is never parsed as
// HTML. It takes its style from where it lands: the marks at the cursor (font,
// size, colour, bold...) and the paragraph settings of the line it's on.
//
// One line goes in where the cursor is, like typing. Several lines are read as
// simple structure: "* ", "- " or "• " lines become bullets, other lines become
// paragraphs, and blank lines only separate them. That structure goes in after
// the current line. Text after a tab is pushed to the right edge of its line
// (the rightTab mark), like the dates on resume entries.

// raw keeps a single line's spacing (" and more") for inline inserts.
type Line = { bullet: boolean; text: string; raw: string };

const BULLET_MARKER = /^[*\-•]\s+/;

function parseLines(text: string): Line[] {
  return text
    .split(/\r?\n/)
    .filter((raw) => raw.trim())
    .map((raw) => {
      const line = raw.trim();
      return { bullet: BULLET_MARKER.test(line), text: line.replace(BULLET_MARKER, "").trim(), raw };
    })
    .filter((line) => line.text);
}

function listItemDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === "listItem") return depth;
  }
  return null;
}

// Lines in the document that have text, to borrow style from.
type Sample = { node: Node; pos: number; inList: boolean };

function textLines(doc: Node): Sample[] {
  const samples: Sample[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.name === "paragraph" && node.textContent.trim()) {
      samples.push({ node, pos, inList: listItemDepth(doc.resolve(pos + 1)) !== null });
    }
    return false;
  });
  return samples;
}

// Closest matching line, preferring the ones above the cursor.
function nearest(samples: Sample[], pos: number, match: (s: Sample) => boolean) {
  return samples.filter((s) => s.pos < pos && match(s)).pop() ?? samples.find((s) => s.pos >= pos && match(s));
}

// Style for inserted text. The cursor's own line wins; an empty line has no
// text (so no font) and its own spacing, so then the nearest line with text
// lends its font, and the nearest bullet or paragraph its spacing and indents.
function styleAtCursor(editor: Editor) {
  const { state } = editor;
  const { $from } = state.selection;
  const line = $from.parent;
  const lineHasText = line.type.name === "paragraph" && line.textContent.trim().length > 0;
  const inList = listItemDepth($from) !== null;
  const samples = textLines(state.doc);

  let marks = (state.storedMarks ?? $from.marks()).map((mark) => mark.toJSON());
  if (!lineHasText) {
    // Only the font, size and colour; a nearby heading shouldn't make everything bold.
    const source = nearest(samples, $from.pos, () => true);
    const text = source && (source.pos < $from.pos ? source.node.lastChild : source.node.firstChild);
    marks = (text?.marks ?? []).filter((mark) => mark.type.name === "textStyle").map((mark) => mark.toJSON());
  }

  const attrsLike = (bullet: boolean) =>
    lineHasText && inList === bullet
      ? { ...line.attrs }
      : (() => {
          const sample = nearest(samples, $from.pos, (s) => s.inList === bullet);
          return sample ? { ...sample.node.attrs } : undefined;
        })();

  return {
    marks: marks.length ? marks : undefined,
    bulletAttrs: attrsLike(true),
    paragraphAttrs: attrsLike(false),
  };
}

type Marks = JSONContent["marks"];

// Text nodes for one line: what's before the first tab, then the rest right-aligned.
function textNodes(text: string, marks: Marks): JSONContent[] {
  const tab = text.indexOf("\t");
  const parts: [string, Marks][] =
    tab < 0
      ? [[text, marks]]
      : [
          [text.slice(0, tab).trimEnd(), marks],
          [text.slice(tab).trim(), [...(marks ?? []), { type: "rightTab" }]],
        ];
  return parts.filter(([text]) => text).map(([text, marks]) => ({ type: "text", text, marks }));
}

function toNodes(lines: Line[], style: ReturnType<typeof styleAtCursor>): JSONContent[] {
  const nodes: JSONContent[] = [];
  for (const line of lines) {
    const paragraph = (attrs?: Record<string, unknown>): JSONContent => ({
      type: "paragraph",
      attrs,
      content: textNodes(line.text, style.marks),
    });
    if (!line.bullet) {
      nodes.push(paragraph(style.paragraphAttrs));
      continue;
    }
    // Consecutive bullets share one list.
    const item = { type: "listItem", content: [paragraph(style.bulletAttrs)] };
    const last = nodes[nodes.length - 1];
    if (last?.type === "bulletList") last.content!.push(item);
    else nodes.push({ type: "bulletList", content: [item] });
  }
  return nodes;
}

// Several lines, after the line the cursor is on.
function insertStructured(editor: Editor, lines: Line[]) {
  const { $from } = editor.state.selection;
  const nodes = toNodes(lines, styleAtCursor(editor));
  const chain = editor.chain().focus();

  // All bullets while in a list: add them to that list, after the current bullet.
  const itemDepth = listItemDepth($from);
  if (itemDepth !== null && lines.every((line) => line.bullet)) {
    chain.insertContentAt($from.after(itemDepth), nodes[0].content!).run();
    return;
  }

  // Otherwise after the top-level block (a whole list counts as one). An
  // empty line is replaced rather than left behind as a gap.
  let range: { from: number; to: number };
  if ($from.depth === 0) {
    range = { from: $from.pos, to: $from.pos };
  } else if ($from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0) {
    range = { from: $from.before(1), to: $from.after(1) };
  } else {
    range = { from: $from.after(1), to: $from.after(1) };
  }
  chain
    .insertContentAt(range, nodes)
    .command(({ tr }) => {
      // Bullets inserted next to an existing list continue it instead of
      // starting a second list. End first, so the start position stays valid.
      const end = tr.selection.$to;
      if (end.depth > 0) joinLists(tr.doc, end.after(1), tr);
      joinLists(tr.doc, range.from, tr);
      return true;
    })
    .run();
}

function joinLists(doc: Node, pos: number, tr: { join: (pos: number) => unknown }) {
  const $pos = doc.resolve(pos);
  if ($pos.nodeBefore?.type.name === "bulletList" && $pos.nodeAfter?.type.name === "bulletList" && canJoin(doc, pos)) {
    tr.join(pos);
  }
}

// One line can go inline unless it's a bullet and the cursor isn't in a list.
function singleInlineLine(editor: Editor, lines: Line[]): string | null {
  if (lines.length !== 1) return null;
  const [line] = lines;
  if (line.bullet) return editor.isActive("listItem") ? line.text : null;
  return line.raw;
}

// Typed text takes the marks at the cursor; a tab needs nodes so the right part gets its mark.
function insertText(chain: ChainedCommands, editor: Editor, text: string) {
  if (!text.includes("\t")) return chain.command(({ tr }) => (tr.insertText(text), true));
  const { state } = editor;
  const marks = (state.storedMarks ?? state.selection.$from.marks()).map((mark) => mark.toJSON());
  return chain.insertContent(textNodes(text, marks.length ? marks : undefined));
}

// Starts a new paragraph, or a new bullet inside a list, carrying the marks over.
function newLine(chain: ChainedCommands, editor: Editor) {
  return editor.isActive("listItem") ? chain.splitListItem("listItem") : chain.splitBlock({ keepMarks: true });
}

// At the cursor, replacing any selection.
export function insertAtCursor(editor: Editor, text: string) {
  const lines = parseLines(text);
  if (!lines.length) return;
  const line = singleInlineLine(editor, lines);
  if (line === null) return insertStructured(editor, lines);
  insertText(editor.chain().focus(), editor, line).run();
}

// As a new line (or bullet) after the one the cursor is in. An empty line is
// filled in place rather than leaving a blank one behind.
export function insertAsNewLine(editor: Editor, text: string) {
  const lines = parseLines(text);
  if (!lines.length) return;
  const line = singleInlineLine(editor, lines);
  if (line === null) return insertStructured(editor, lines);
  const { $from } = editor.state.selection;
  let chain = editor.chain().focus();
  if ($from.parent.textContent.length > 0) {
    chain = newLine(chain.setTextSelection($from.end()), editor);
  }
  insertText(chain, editor, line).run();
}
