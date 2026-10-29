import JSZip from "jszip";
import { fontStackFor } from "./fontOptions";
import { DEFAULT_LAYOUT, PageLayout } from "./pageLayout";

// Converts a Word .docx file to HTML the editor can load, keeping the
// formatting the editor supports: fonts, sizes, bold/italic/underline/strike,
// text color, alignment, line and paragraph spacing, indents, right-aligned
// tabs, headings, lists and links. Also returns the page size and margins.
//
// A .docx is a zip of XML files. Formatting comes from several layers that
// override each other in order: document defaults → paragraph style (and the
// styles it's based on) → character style → formatting applied directly.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const V = "urn:schemas-microsoft-com:vml";
const O = "urn:schemas-microsoft-com:office:office";

type RunProps = {
  font?: string;
  size?: number; // points
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  caps?: boolean;
  color?: string;
};

type ParaProps = {
  align?: string;
  lineSpacing?: string; // multiple ("1.08") or exact height ("14pt")
  spaceBefore?: number; // points
  spaceAfter?: number; // points
  contextualSpacing?: boolean; // no space between paragraphs of the same style
  indent?: number; // points
  firstLineIndent?: number; // points; negative for a hanging indent
  tabStops?: "right" | "left"; // custom tab stops: any right-aligned, or only left
  numId?: string;
  ilvl?: number;
};

type Style = {
  name: string;
  basedOn?: string;
  para: ParaProps;
  run: RunProps;
};

type Context = {
  styles: Map<string, Style>;
  defaultParaStyle?: string;
  defaults: { para: ParaProps; run: RunProps };
  themeFonts: { major?: string; minor?: string };
  fontFamilies: Map<string, string>;
  links: Map<string, string>;
  listFormats: Map<string, Map<number, ListLevel>>;
};

type ListLevel = { type: "ul" | "ol"; indent?: number };

type Block = {
  tag: string;
  styleId?: string;
  para: ParaProps;
  html: string;
  list?: { type: "ul" | "ol"; level: number; indent?: number };
};

// A run's text (tabs as \t, line breaks as \n) and how to format it as HTML.
type Segment = { text: string; wrap: (html: string) => string };

export async function docxToHtml(file: File): Promise<{ html: string; layout: PageLayout }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const read = async (path: string) => {
    const text = await zip.file(path)?.async("string");
    return text ? new DOMParser().parseFromString(text, "application/xml") : undefined;
  };

  const documentXml = await read("word/document.xml");
  if (!documentXml) throw new Error("Not a Word document: word/document.xml is missing");

  const [stylesXml, themeXml, numberingXml, relsXml, fontTableXml] = await Promise.all([
    read("word/styles.xml"),
    read("word/theme/theme1.xml"),
    read("word/numbering.xml"),
    read("word/_rels/document.xml.rels"),
    read("word/fontTable.xml"),
  ]);

  const ctx: Context = {
    styles: new Map(),
    defaults: { para: {}, run: {} },
    themeFonts: readThemeFonts(themeXml),
    fontFamilies: readFontFamilies(fontTableXml),
    links: readLinks(relsXml),
    listFormats: readListFormats(numberingXml),
  };
  readStyles(stylesXml, ctx);

  const body = first(documentXml.documentElement, "body");
  const blocks: Block[] = [];
  if (body) collectBlocks(body, ctx, blocks);
  return { html: renderBlocks(blocks), layout: readLayout(body, ctx) };
}

// Page size and margins come from the section properties at the end of the
// body; the base font from the default paragraph style.
function readLayout(body: Element | undefined, ctx: Context): PageLayout {
  const sectPr = first(body, "sectPr");
  const inches = (el: Element | undefined, name: string, fallback: number) => {
    const twips = Number(attr(el, name));
    return twips > 0 ? twips / 1440 : fallback;
  };
  const pgSz = first(sectPr, "pgSz");
  const pgMar = first(sectPr, "pgMar");

  const run: RunProps = Object.assign({}, ctx.defaults.run, ...styleChain(ctx.defaultParaStyle, ctx).map((s) => s.run));
  return {
    width: inches(pgSz, "w", DEFAULT_LAYOUT.width),
    height: inches(pgSz, "h", DEFAULT_LAYOUT.height),
    marginTop: inches(pgMar, "top", DEFAULT_LAYOUT.marginTop),
    marginRight: inches(pgMar, "right", DEFAULT_LAYOUT.marginRight),
    marginBottom: inches(pgMar, "bottom", DEFAULT_LAYOUT.marginBottom),
    marginLeft: inches(pgMar, "left", DEFAULT_LAYOUT.marginLeft),
    fontFamily: run.font && fontStackFor(run.font, ctx.fontFamilies.get(run.font)),
    fontSize: run.size ? `${run.size}pt` : undefined,
  };
}

// ---- XML helpers -----------------------------------------------------------

function children(el: Element, name?: string): Element[] {
  return Array.from(el.children).filter((c) => !name || c.localName === name);
}

function first(el: Element | null | undefined, name: string): Element | undefined {
  return el ? children(el, name)[0] : undefined;
}

function attr(el: Element | undefined, name: string): string | undefined {
  return el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? undefined;
}

// Toggle properties like <w:b/> are on unless val is "0"/"false"/"none".
function toggle(el: Element | undefined): boolean | undefined {
  if (!el) return undefined;
  const val = attr(el, "val");
  return !(val === "0" || val === "false" || val === "none");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- Package parts ---------------------------------------------------------

function readThemeFonts(theme?: Document) {
  const fonts: Context["themeFonts"] = {};
  if (!theme) return fonts;
  const latin = (scheme: string) =>
    theme.getElementsByTagNameNS(A, scheme)[0]?.getElementsByTagNameNS(A, "latin")[0]?.getAttribute("typeface") ??
    undefined;
  fonts.major = latin("majorFont");
  fonts.minor = latin("minorFont");
  return fonts;
}

// fontTable.xml says whether each font is serif, sans-serif, etc., which gives
// unknown fonts a sensible fallback.
function readFontFamilies(fontTable?: Document) {
  const generic: Record<string, string> = { roman: "serif", swiss: "sans-serif", modern: "monospace", script: "cursive" };
  const families = new Map<string, string>();
  if (!fontTable) return families;
  for (const font of children(fontTable.documentElement, "font")) {
    const name = attr(font, "name");
    const family = generic[attr(first(font, "family"), "val") ?? ""];
    if (name && family) families.set(name, family);
  }
  return families;
}

function readLinks(rels?: Document) {
  const links = new Map<string, string>();
  if (!rels) return links;
  for (const rel of Array.from(rels.documentElement.children)) {
    if (rel.getAttribute("TargetMode") === "External") {
      links.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
    }
  }
  return links;
}

function readListFormats(numbering?: Document) {
  const formats = new Map<string, Map<number, ListLevel>>();
  if (!numbering) return formats;
  const abstracts = new Map<string, Map<number, ListLevel>>();
  for (const abstract of children(numbering.documentElement, "abstractNum")) {
    const levels = new Map<number, ListLevel>();
    for (const lvl of children(abstract, "lvl")) {
      const format = attr(first(lvl, "numFmt"), "val");
      levels.set(Number(attr(lvl, "ilvl") ?? 0), {
        type: format === "bullet" || format === "none" ? "ul" : "ol",
        indent: parseParaProps(first(lvl, "pPr")).indent,
      });
    }
    abstracts.set(attr(abstract, "abstractNumId") ?? "", levels);
  }
  for (const num of children(numbering.documentElement, "num")) {
    const levels = abstracts.get(attr(first(num, "abstractNumId"), "val") ?? "");
    if (levels) formats.set(attr(num, "numId") ?? "", levels);
  }
  return formats;
}

function readStyles(styles: Document | undefined, ctx: Context) {
  if (!styles) return;
  const docDefaults = first(styles.documentElement, "docDefaults");
  ctx.defaults.run = parseRunProps(first(first(docDefaults, "rPrDefault"), "rPr"), ctx);
  ctx.defaults.para = parseParaProps(first(first(docDefaults, "pPrDefault"), "pPr"));

  for (const style of children(styles.documentElement, "style")) {
    const id = attr(style, "styleId");
    if (!id) continue;
    ctx.styles.set(id, {
      name: attr(first(style, "name"), "val") ?? id,
      basedOn: attr(first(style, "basedOn"), "val"),
      para: parseParaProps(first(style, "pPr")),
      run: parseRunProps(first(style, "rPr"), ctx),
    });
    if (attr(style, "type") === "paragraph" && ["1", "true", "on"].includes(attr(style, "default") ?? "")) {
      ctx.defaultParaStyle = id;
    }
  }
}

// ---- Formatting ------------------------------------------------------------

function parseRunProps(rPr: Element | undefined, ctx: Context): RunProps {
  const props: RunProps = {};
  if (!rPr) return props;

  const fonts = first(rPr, "rFonts");
  if (fonts) {
    const theme = attr(fonts, "asciiTheme") ?? attr(fonts, "hAnsiTheme");
    const font = attr(fonts, "ascii") ?? attr(fonts, "hAnsi") ?? (theme && (theme.startsWith("major") ? ctx.themeFonts.major : ctx.themeFonts.minor));
    if (font) props.font = font;
  }

  const size = attr(first(rPr, "sz"), "val");
  if (size) props.size = Number(size) / 2; // stored in half-points

  props.bold = toggle(first(rPr, "b"));
  props.italic = toggle(first(rPr, "i"));
  props.strike = toggle(first(rPr, "strike"));
  props.caps = toggle(first(rPr, "caps"));
  const underline = first(rPr, "u");
  if (underline) props.underline = attr(underline, "val") !== "none";

  const color = attr(first(rPr, "color"), "val");
  if (color) props.color = color;

  return withoutUndefined(props);
}

function parseParaProps(pPr: Element | undefined): ParaProps {
  const props: ParaProps = {};
  if (!pPr) return props;

  const align = attr(first(pPr, "jc"), "val");
  if (align) {
    props.align = { both: "justify", distribute: "justify", start: "left", end: "right" }[align] ?? align;
  }

  // Spacing values are in twentieths of a point. "auto" line spacing is a
  // multiple of single spacing (240 = single); otherwise it's a height.
  const spacing = first(pPr, "spacing");
  const line = attr(spacing, "line");
  const rule = attr(spacing, "lineRule") ?? "auto";
  if (line) {
    props.lineSpacing =
      rule === "auto" ? String(Math.round((Number(line) / 240) * 100) / 100) : `${Number(line) / 20}pt`;
  }
  const before = attr(spacing, "before");
  const after = attr(spacing, "after");
  if (before) props.spaceBefore = Number(before) / 20;
  if (after) props.spaceAfter = Number(after) / 20;
  props.contextualSpacing = toggle(first(pPr, "contextualSpacing"));

  const ind = first(pPr, "ind");
  const left = attr(ind, "left") ?? attr(ind, "start");
  if (left) props.indent = Number(left) / 20;
  const hanging = attr(ind, "hanging");
  const firstLine = attr(ind, "firstLine");
  if (hanging) props.firstLineIndent = -Number(hanging) / 20;
  else if (firstLine) props.firstLineIndent = Number(firstLine) / 20;

  const stops = children(first(pPr, "tabs") ?? pPr, "tab").map((tab) => attr(tab, "val") ?? "");
  if (stops.some((val) => val === "right" || val === "end")) props.tabStops = "right";
  else if (stops.some((val) => val !== "clear")) props.tabStops = "left";

  const numPr = first(pPr, "numPr");
  if (numPr) {
    props.numId = attr(first(numPr, "numId"), "val");
    props.ilvl = Number(attr(first(numPr, "ilvl"), "val") ?? 0);
  }

  return withoutUndefined(props);
}

function withoutUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

// Walks a style and everything it's based on, oldest ancestor first.
function styleChain(id: string | undefined, ctx: Context): Style[] {
  const chain: Style[] = [];
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const style = ctx.styles.get(id);
    if (!style) break;
    chain.unshift(style);
    id = style.basedOn;
  }
  return chain;
}

function headingLevel(styleId: string | undefined, ctx: Context): number | undefined {
  for (const style of styleChain(styleId, ctx).reverse()) {
    if (/^title$/i.test(style.name)) return 1;
    const match = /^heading\s*(\d)$/i.exec(style.name);
    if (match) return Math.min(Number(match[1]), 6);
  }
  return undefined;
}

// ---- Document body ---------------------------------------------------------

// Content controls (w:sdt), common in resume templates, wrap paragraphs that
// should be treated as if they were directly in the body. Tables aren't
// supported by the editor yet, so their cells are read top to bottom.
function collectBlocks(container: Element, ctx: Context, blocks: Block[]) {
  for (const el of children(container)) {
    switch (el.localName) {
      case "p":
        blocks.push(isHorizontalRule(el) ? { tag: "hr", para: {}, html: "" } : convertParagraph(el, ctx));
        break;
      case "tbl":
        for (const row of children(el, "tr")) {
          for (const cell of children(row, "tc")) collectBlocks(cell, ctx, blocks);
        }
        break;
      case "sdt":
        collectBlocks(first(el, "sdtContent") ?? el, ctx, blocks);
        break;
      case "customXml":
      case "sdtContent":
        collectBlocks(el, ctx, blocks);
        break;
    }
  }
}

// Word's Insert > Horizontal Line is an old-style VML shape flagged o:hr.
function isHorizontalRule(p: Element): boolean {
  const shapes = Array.from(p.getElementsByTagNameNS(V, "rect"));
  return shapes.some((shape) => shape.getAttributeNS(O, "hr") === "t") && !p.textContent?.trim();
}

function convertParagraph(p: Element, ctx: Context): Block {
  const pPr = first(p, "pPr");
  const styleId = attr(first(pPr, "pStyle"), "val") ?? ctx.defaultParaStyle;
  const chain = styleChain(styleId, ctx);

  const direct = parseParaProps(pPr);
  const para: ParaProps = Object.assign({}, ctx.defaults.para, ...chain.map((s) => s.para), direct);
  const baseRun: RunProps = Object.assign({}, ctx.defaults.run, ...chain.map((s) => s.run));

  const level = headingLevel(styleId, ctx);
  const block: Block = { tag: level ? `h${level}` : "p", styleId, para, html: paragraphHtml(p, para, baseRun, ctx) };

  if (para.numId && para.numId !== "0") {
    const listLevel = para.ilvl ?? 0;
    const format = ctx.listFormats.get(para.numId)?.get(listLevel);
    block.tag = "p"; // list items hold paragraphs, not headings
    // The list's own indent beats the paragraph style's, but not direct formatting.
    block.list = { type: format?.type ?? "ul", level: listLevel, indent: direct.indent ?? format?.indent ?? para.indent };
  }
  return block;
}

// Resume dates and GPAs sit at the end of a line, lined up with a right tab
// stop or by hand with tabs and spaces. A gap like that followed by short text
// is pushed to the right margin; other tabs become a few spaces.
function paragraphHtml(p: Element, para: ParaProps, baseRun: RunProps, ctx: Context): string {
  const segments = convertRuns(p, baseRun, ctx);
  const text = segments.map((s) => s.text).join("");
  const end = text.replace(/[\t ]+$/, "").length;

  const centered = para.align === "center" || para.align === "right";
  if (!centered) {
    const gaps = [...text.slice(0, end).matchAll(para.tabStops === "right" ? /\t[\t ]*/g : /\t[\t ]*| {3,}[\t ]*/g)];
    const gap = gaps[gaps.length - 1];
    if (gap && gap.index! > 0) {
      const gapEnd = gap.index! + gap[0].length;
      // With only left tab stops, a single tab is a column, but a long run of
      // tabs and spaces before short text is still a hand-aligned date.
      const isDate =
        para.tabStops === "right" || (end - gapEnd <= 40 && (para.tabStops !== "left" || gap[0].length > 1));
      if (isDate) {
        return `${renderSegments(segments, 0, gap.index!)}<span data-right-tab>${renderSegments(segments, gapEnd, end)}</span>`;
      }
    }
  }
  return renderSegments(segments, 0, end);
}

// Renders the characters from..to of the paragraph's text, keeping each run's formatting.
function renderSegments(segments: Segment[], from: number, to: number): string {
  let html = "";
  let offset = 0;
  for (const segment of segments) {
    const start = Math.max(from, offset);
    const stop = Math.min(to, offset + segment.text.length);
    if (start < stop) {
      const text = segment.text.slice(start - offset, stop - offset);
      html += segment.wrap(escapeHtml(text).replace(/\t/g, "\u00a0\u00a0\u00a0\u00a0").replace(/\n/g, "<br>"));
    }
    offset += segment.text.length;
  }
  return html;
}

function convertRuns(container: Element, baseRun: RunProps, ctx: Context, href?: string): Segment[] {
  const segments: Segment[] = [];
  for (const el of children(container)) {
    switch (el.localName) {
      case "r":
        segments.push(convertRun(el, baseRun, ctx, href));
        break;
      case "hyperlink": {
        const id = el.getAttributeNS(R, "id") ?? el.getAttribute("r:id");
        segments.push(...convertRuns(el, baseRun, ctx, (id && ctx.links.get(id)) || href));
        break;
      }
      case "sdt":
        segments.push(...convertRuns(first(el, "sdtContent") ?? el, baseRun, ctx, href));
        break;
      case "ins":
      case "smartTag":
      case "fldSimple":
      case "customXml":
      case "sdtContent":
        segments.push(...convertRuns(el, baseRun, ctx, href));
        break;
      // w:del (tracked deletions) and w:pPr are skipped
    }
  }
  return segments;
}

function convertRun(r: Element, baseRun: RunProps, ctx: Context, href?: string): Segment {
  const rPr = first(r, "rPr");
  const charStyle = attr(first(rPr, "rStyle"), "val");
  const props: RunProps = Object.assign(
    {},
    baseRun,
    ...styleChain(charStyle, ctx).map((s) => s.run),
    parseRunProps(rPr, ctx),
  );

  let text = "";
  for (const el of children(r)) {
    switch (el.localName) {
      case "t":
        text += props.caps ? (el.textContent ?? "").toUpperCase() : (el.textContent ?? "");
        break;
      case "tab":
        text += "\t";
        break;
      case "br":
      case "cr":
        if (attr(el, "type") !== "page") text += "\n";
        break;
      case "noBreakHyphen":
        text += "-";
        break;
    }
  }

  const css: string[] = [];
  if (props.font) css.push(`font-family: ${fontStackFor(props.font, ctx.fontFamilies.get(props.font))}`);
  if (props.size) css.push(`font-size: ${props.size}pt`);
  // Black and "auto" are left as the default text color so they stay readable in dark mode.
  if (props.color && !/^(auto|000000)$/i.test(props.color)) css.push(`color: #${props.color}`);

  const wrap = (html: string) => {
    if (css.length) html = `<span style="${escapeHtml(css.join("; "))}">${html}</span>`;
    if (props.bold) html = `<strong>${html}</strong>`;
    if (props.italic) html = `<em>${html}</em>`;
    if (props.underline) html = `<u>${html}</u>`;
    if (props.strike) html = `<s>${html}</s>`;
    if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
    return html;
  };
  return { text, wrap };
}

// ---- Output ----------------------------------------------------------------

function blockAttributes(block: Block, prev: Block | undefined, next: Block | undefined): string {
  const { para } = block;
  // Contextual spacing drops the space between paragraphs of the same style.
  const sameAs = (other?: Block) => para.contextualSpacing && other?.styleId === block.styleId;

  const css: string[] = [];
  if (para.align && para.align !== "left") css.push(`text-align: ${para.align}`);
  css.push(`padding-top: ${sameAs(prev) ? 0 : (para.spaceBefore ?? 0)}pt`);
  css.push(`margin-bottom: ${sameAs(next) ? 0 : (para.spaceAfter ?? 0)}pt`);
  if (block.list) {
    // The editor's lists already indent 0.5in (36pt); add whatever Word adds beyond that.
    const extra = (block.list.indent ?? 36) - 36;
    if (extra > 0) css.push(`margin-left: ${extra}pt`);
  } else {
    if (para.indent) css.push(`margin-left: ${para.indent}pt`);
    if (para.firstLineIndent) css.push(`text-indent: ${para.firstLineIndent}pt`);
  }

  const lineSpacing = para.lineSpacing ? ` data-line-spacing="${para.lineSpacing}"` : "";
  return `${lineSpacing} style="${css.join("; ")}"`;
}

// Word stores lists as flat paragraphs with a nesting level; HTML needs them
// nested, so consecutive list paragraphs are grouped into <ul>/<ol> trees.
function renderBlocks(blocks: Block[]): string {
  let html = "";
  const open: { type: string; level: number }[] = [];
  const closeDeeperThan = (level: number) => {
    while (open.length && open[open.length - 1].level > level) html += `</li></${open.pop()!.type}>`;
  };

  for (const [i, block] of blocks.entries()) {
    const element =
      block.tag === "hr"
        ? "<hr>"
        : `<${block.tag}${blockAttributes(block, blocks[i - 1], blocks[i + 1])}>${block.html}</${block.tag}>`;
    if (!block.list) {
      closeDeeperThan(-1);
      html += element;
      continue;
    }

    const { type, level } = block.list;
    closeDeeperThan(level);
    let top = open[open.length - 1];
    if (top && top.level === level && top.type !== type) {
      html += `</li></${open.pop()!.type}>`;
      top = open[open.length - 1];
    }
    if (top && top.level === level) {
      html += `</li><li>${element}`;
    } else {
      html += `<${type}><li>${element}`;
      open.push({ type, level });
    }
  }
  closeDeeperThan(-1);
  return html;
}
