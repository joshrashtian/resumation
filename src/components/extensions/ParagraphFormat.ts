import { Extension } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setLineSpacing: (lineSpacing: string) => ReturnType;
      unsetLineSpacing: () => ReturnType;
    };
  }
}

// Word's "single" spacing is the font's natural line height, about 1.2x the
// font size, so a Word multiple like 1.08 becomes a CSS line-height of ~1.3.
const SINGLE_LINE = 1.2;

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
    };
  },
});
