import { Extension } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setLineSpacing: (lineSpacing: string) => ReturnType;
      unsetLineSpacing: () => ReturnType;
      // Moves the left indent by a number of points, never below zero.
      changeIndent: (by: number) => ReturnType;
      // Like Word's Increase/Decrease Indent (Tab / Shift-Tab): nests or
      // un-nests bullets, and moves other paragraphs by half an inch.
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

// Word's "single" spacing is the font's natural line height, about 1.2x the
// font size, so a Word multiple like 1.08 becomes a CSS line-height of ~1.3.
const SINGLE_LINE = 1.2;

// Word's default indent step, half an inch.
const INDENT_STEP = 36;

function lineHeightCss(lineSpacing: string): string {
  if (lineSpacing.endsWith("pt")) return lineSpacing; // exact height
  return String(Math.round(Number(lineSpacing) * SINGLE_LINE * 1000) / 1000);
}

// A paragraph attribute stored as a single CSS property, e.g. "6pt".
function styleAttribute(name: string, property: string) {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.getPropertyValue(property) || null,
    renderHTML: (attributes: Record<string, string | null>) =>
      attributes[name] ? { style: `${property}: ${attributes[name]}` } : {},
  };
}

// Word-style paragraph formatting: line spacing (single, 1.5, double...),
// space before/after, left indent and first-line indent. These apply to the
// whole paragraph, like a word processor, rather than to selected text.
export const ParagraphFormat = Extension.create({
  name: "paragraphFormat",

  addOptions() {
    return { types: ["paragraph", "heading"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          // A multiple of single spacing ("1.5") or an exact height ("14pt").
          lineSpacing: {
            default: null,
            parseHTML: (element) => element.dataset.lineSpacing ?? null,
            renderHTML: (attributes) =>
              attributes.lineSpacing
                ? { "data-line-spacing": attributes.lineSpacing, style: `line-height: ${lineHeightCss(attributes.lineSpacing)}` }
                : {},
          },
          // Padding rather than margin so it adds to the previous paragraph's
          // space after, as in Word, instead of the two collapsing together.
          spaceBefore: styleAttribute("spaceBefore", "padding-top"),
          spaceAfter: styleAttribute("spaceAfter", "margin-bottom"),
          indent: styleAttribute("indent", "margin-left"),
          firstLineIndent: styleAttribute("firstLineIndent", "text-indent"),
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing:
        (lineSpacing) =>
        ({ commands }) =>
          this.options.types
            .map((type: string) => commands.updateAttributes(type, { lineSpacing }))
            .some(Boolean),
      unsetLineSpacing:
        () =>
        ({ commands }) =>
          this.options.types
            .map((type: string) => commands.resetAttributes(type, "lineSpacing"))
            .some(Boolean),
      changeIndent:
        (by) =>
        ({ state, tr, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!this.options.types.includes(node.type.name)) return true;
            const current = parseFloat(node.attrs.indent ?? "0") || 0;
            const next = Math.max(0, current + by);
            if (next !== current) {
              changed = true;
              // A hanging indent with no left indent would push text off the page.
              const firstLineIndent = next === 0 && parseFloat(node.attrs.firstLineIndent ?? "0") < 0 ? null : node.attrs.firstLineIndent;
              if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next ? `${next}pt` : null, firstLineIndent });
            }
            return false;
          });
          return changed;
        },
      indent:
        () =>
        ({ editor, commands }) =>
          editor.isActive("listItem") ? commands.sinkListItem("listItem") : commands.changeIndent(INDENT_STEP),
      // In a list, any extra indent Word gave the bullet goes first, then the bullet un-nests.
      outdent:
        () =>
        ({ editor, commands }) =>
          editor.isActive("listItem")
            ? commands.changeIndent(-INDENT_STEP) || commands.liftListItem("listItem")
            : commands.changeIndent(-INDENT_STEP),
    };
  },

  addKeyboardShortcuts() {
    // Always handled, so Tab never moves focus out of the document.
    return {
      Tab: () => (this.editor.commands.indent(), true),
      "Shift-Tab": () => (this.editor.commands.outdent(), true),
      // As in Word: Backspace at the very start of an indented line removes the
      // first-line indent, then the left indent, before it joins lines. Bullets
      // keep their own Backspace (un-bullet).
      Backspace: () => {
        const { selection } = this.editor.state;
        const { $from } = selection;
        const line = $from.parent;
        if (!selection.empty || $from.parentOffset !== 0) return false;
        if (!this.options.types.includes(line.type.name) || this.editor.isActive("listItem")) return false;
        if (parseFloat(line.attrs.firstLineIndent ?? "0") > 0) {
          return this.editor.commands.updateAttributes(line.type.name, { firstLineIndent: null });
        }
        return this.editor.commands.changeIndent(-INDENT_STEP);
      },
    };
  },
});
