// Turns copied rich text (from the resume editor, Word, Google Docs...) into
// the plain-text shape Text Blocks use: one line per paragraph, "* " for each
// list item, and a blank line around lists. Plain-text copies lose the bullets
// and put blank lines between every paragraph, so pastes go through here.

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TR", "BLOCKQUOTE", "PRE"]);

type Line = { text: string; bullet: boolean };

function collectLines(root: Node): Line[] {
  const lines: Line[] = [];
  let current = "";
  let inItem = 0;

  const flush = (bullet: boolean) => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) lines.push({ text, bullet });
    current = "";
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent ?? "";
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === "BR") return flush(inItem > 0);
    // Word marks its fake list items with mso-list instead of <li>.
    const isItem = node.tagName === "LI" || /mso-list/i.test(node.getAttribute("style") ?? "");
    const isBlock = BLOCK_TAGS.has(node.tagName) || isItem;
    if (isBlock) flush(inItem > 0);
    if (isItem) inItem++;
    node.childNodes.forEach(walk);
    if (isBlock) flush(inItem > 0);
    if (isItem) inItem--;
  };

  walk(root);
  flush(false);
  return lines;
}

export function htmlToBlockText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, head, title, meta").forEach((el) => el.remove());
  const lines = collectLines(doc.body);

  let out = "";
  lines.forEach((line, i) => {
    // Word's list items often start with their own bullet glyph; drop it.
    const text = line.bullet ? line.text.replace(/^(?:[•·▪◦§*-]\s*|o\s+)/, "") : line.text;
    if (i > 0) out += lines[i - 1].bullet !== line.bullet ? "\n\n" : "\n";
    out += line.bullet ? `* ${text}` : text;
  });
  return out;
}

// For plain-text pastes: at most one blank line in a row.
export function tidyPlainText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}
