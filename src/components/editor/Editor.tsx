import { useEffect, useRef, useState } from "react";
import { EditorContent, JSONContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { ParagraphFormat } from "./extensions/ParagraphFormat";
import { RightTab } from "./extensions/RightTab";
import { PageLimit, contentHeight } from "./extensions/PageLimit";
import { DEFAULT_LAYOUT, PageLayout } from "../../lib/pageLayout";
import EditorToolbar from "./EditorToolbar";
import styles from "./Editor.module.css";
import { LuGripVertical } from "react-icons/lu";

// Where a top-level block's text starts on screen; a list is measured by its
// first item's text, so bullets count as indented by the list itself.
function textLeft(editor: TiptapEditor, pos: number): number | null {
  const dom = editor.view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  const text = dom.matches("ul, ol") ? dom.querySelector("li > *") : dom;
  return text instanceof HTMLElement ? text.getBoundingClientRect().left : null;
}

const SECTION_TITLE = 1; // e.g. "PROGRAMMING PROJECTS"
const ENTRY_TITLE = 2; // e.g. "MESAMobile, iOS App"

// Resume titles by how they look rather than by heading level: an all-caps
// line starts a section, and a line whose words are all bold starts an entry.
// A right-aligned date doesn't count either way.
function titleRank(node: PMNode): number | null {
  if (node.type.name === "heading") return SECTION_TITLE;
  if (node.type.name !== "paragraph") return null;
  let text = "";
  let allBold = true;
  node.descendants((child) => {
    if (!child.isText || !child.text!.trim() || child.marks.some((m) => m.type.name === "rightTab")) return;
    text += child.text;
    if (!child.marks.some((m) => m.type.name === "bold")) allBold = false;
  });
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 2 && letters === letters.toUpperCase()) return SECTION_TITLE;
  return text.trim() && allBold ? ENTRY_TITLE : null;
}

// Selects what dragging a block should move with it: a section title takes
// everything up to the next section, an entry title everything up to the next
// entry or section, and any other line the lines indented further under it
// (e.g. a "Languages" line and its bullets). The drag handle drags a
// selection that covers the block it's on.
function selectSection(editor: TiptapEditor, pos: number) {
  const { doc } = editor.state;
  const $pos = doc.resolve(pos);
  const left = textLeft(editor, pos);
  if ($pos.depth !== 0 || left === null) return;
  const rank = titleRank(doc.child($pos.index(0)));
  let end = pos + doc.child($pos.index(0)).nodeSize;
  for (let i = $pos.index(0) + 1; i < doc.childCount; i++) {
    const nextRank = titleRank(doc.child(i));
    if (rank !== null) {
      if (nextRank !== null && nextRank <= rank) break;
    } else {
      const nextLeft = textLeft(editor, end);
      // A pixel of slack so rounding doesn't make two equal indents differ.
      if (nextRank !== null || nextLeft === null || nextLeft <= left + 1) break;
    }
    end += doc.child(i).nodeSize;
  }
  const selection = TextSelection.between(doc.resolve(pos + 1), doc.resolve(end - 1));
  editor.view.dispatch(editor.state.tr.setSelection(selection));
}

const lineCount = (n: number) => `${n} line${n === 1 ? "" : "s"}`;

export type PageStatus = {
  usage: number;
  limitHit: boolean;
};

type EditorProps = {
  content?: string | JSONContent;
  onChange?: (html: string, json: JSONContent) => void;
  pageLimit?: number;
  layout?: PageLayout;
  onPageStatusChange?: (status: PageStatus) => void;
  // Hands the Tiptap editor to the parent, and null once it goes away.
  onReady?: (editor: TiptapEditor | null) => void;
  // False shows the document read-only, e.g. while previewing an old version.
  editable?: boolean;
  // Opens the Text Blocks picker; also fired by typing "/" on an empty line.
  onInsertBlock?: () => void;
};

function Editor({ content = "", onChange, pageLimit = 0, layout = DEFAULT_LAYOUT, onPageStatusChange, onReady, editable = true, onInsertBlock }: EditorProps) {

  const textWidth = layout.width - layout.marginLeft - layout.marginRight;
  const textHeight = layout.height - layout.marginTop - layout.marginBottom;
  const limitHeight = pageLimit * textHeight * 96;

  const onInsertBlockRef = useRef(onInsertBlock);
  onInsertBlockRef.current = onInsertBlock;

  const editor = useEditor({
    extensions: [
      // Clicking a link edits it rather than leaving the app.
      StarterKit.configure({ link: { openOnClick: false } }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ParagraphFormat,
      RightTab,
      PageLimit,
    ],
    content,
    editorProps: {
      // "/" on an empty line opens Insert block; anywhere else it types a slash.
      handleKeyDown: (view, event) => {
        const { $from, empty } = view.state.selection;
        if (event.key !== "/" || !empty || $from.parent.content.size || !onInsertBlockRef.current || !view.editable) return false;
        onInsertBlockRef.current();
        return true;
      },
    },
    onCreate: ({ editor }) => onChange?.(editor.getHTML(), editor.getJSON()),
    onUpdate: ({ editor }) => onChange?.(editor.getHTML(), editor.getJSON()),
  });

  const [pageUsage, setPageUsage] = useState(0);
  const [limitHit, setLimitHit] = useState(false);
  // Content height, and the average height a line of text takes with its
  // spacing, in px, for the sheet's page-end notes.
  const [usedHeight, setUsedHeight] = useState(0);
  const [linePitch, setLinePitch] = useState(0);
  const lineProbe = useRef<HTMLSpanElement>(null);
  // A list item's bullet sits outside its box, so the handle moves further out to clear it.
  const [handleOnListItem, setHandleOnListItem] = useState(false);
  const handlePos = useRef<number | null>(null);

  useEffect(() => {
    const maxHeight = pageLimit ? limitHeight : null;
    const storage = editor.storage.pageLimit;
    storage.maxHeight = maxHeight;

    let hideTimer: number | undefined;
    storage.onBlocked = () => {
      setLimitHit(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setLimitHit(false), 2000);
    };

    const measure = () => {
      const dom = editor.view.dom;
      const height = dom.isConnected ? contentHeight(dom) : 0;
      setUsedHeight(height);
      // Paragraph spacing counts too, so divide the content height by the
      // number of rendered lines rather than by a bare line height.
      const lineHeight = lineProbe.current?.offsetHeight ?? 0;
      let lines = 0;
      if (lineHeight) {
        dom.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6").forEach((el) => {
          lines += Math.max(1, Math.round(el.offsetHeight / lineHeight));
        });
      }
      setLinePitch(lines ? height / lines : lineHeight);
      setPageUsage(maxHeight ? height / maxHeight : 0);
    };
    measure();
    document.fonts.ready.then(measure);
    editor.on("update", measure);
    return () => {
      editor.off("update", measure);
      window.clearTimeout(hideTimer);
      storage.maxHeight = null;
      storage.onBlocked = undefined;
    };
  }, [editor, pageLimit, limitHeight, layout.fontFamily, layout.fontSize]);

  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    onReadyRef.current?.(editor);
    return () => onReadyRef.current?.(null);
  }, [editor]);

  const onPageStatusChangeRef = useRef(onPageStatusChange);
  onPageStatusChangeRef.current = onPageStatusChange;
  useEffect(() => {
    onPageStatusChangeRef.current?.({ usage: pageUsage, limitHit });
  }, [pageUsage, limitHit]);

  // Where the last allowed page and the content end, in px from the top of the sheet.
  const pageEnd = layout.marginTop * 96 + limitHeight;
  const contentEnd = layout.marginTop * 96 + usedHeight;
  const over = pageLimit > 0 && usedHeight > limitHeight + 1;
  const linesOver = linePitch ? Math.max(1, Math.round((contentEnd - pageEnd) / linePitch)) : 0;
  const linesLeft = linePitch ? Math.floor((pageEnd - contentEnd) / linePitch) : 0;

  return (
    <div
      className={pageLimit ? `${styles.editor} ${styles.limited}` : styles.editor}
      style={
        {
          "--pages": pageLimit,
          "--page-text-width": `${textWidth}in`,
          "--page-text-height": `${textHeight}in`,
          "--margin-top": `${layout.marginTop}in`,
          "--margin-right": `${layout.marginRight}in`,
          "--margin-bottom": `${layout.marginBottom}in`,
          "--margin-left": `${layout.marginLeft}in`,
          "--doc-font-family": layout.fontFamily,
          "--doc-font-size": layout.fontSize,
        } as React.CSSProperties
      }
    >
      <div className={styles.page}>
        <EditorToolbar
          editor={editor}
          defaultFont={layout.fontFamily}
          defaultSize={layout.fontSize}
        />

        {editable && (
          <DragHandle
            editor={editor}
            nested={{ edgeDetection: "none" }}
            className={handleOnListItem ? `${styles.dragHandle} ${styles.listItem}` : styles.dragHandle}
            onNodeChange={({ node, pos }) => {
              handlePos.current = node ? pos : null;
              setHandleOnListItem(node?.type.name === "listItem");
            }}
            onElementDragStart={() => handlePos.current !== null && selectSection(editor, handlePos.current)}
            // A drop leaves the moved blocks selected, and grabbing any block
            // inside a selection drags all of it, so clear it once the drag ends.
            onElementDragEnd={() => setTimeout(() => editor.commands.setTextSelection(editor.state.selection.to))}
          >
            <LuGripVertical />
          </DragHandle>
        )}
        <div className={styles.sheet}>
          <div className={styles.guides} aria-hidden />
          {over && <div className={styles.overflow} style={{ top: pageEnd }} aria-hidden />}
          <EditorContent editor={editor} className={styles.content} />
          <span ref={lineProbe} className={styles.lineProbe} aria-hidden>
            X
          </span>

          {/* The footer says the same in words; these show where on the page. */}
          {pageLimit > 0 && linePitch > 0 && (
            <div className={styles.notes} aria-hidden>
              {over ? (
                <>
                  <div className={`${styles.bracket} ${styles.over}`} style={{ top: pageEnd, height: contentEnd - pageEnd }} />
                  <div className={styles.note} style={{ top: pageEnd }}>
                    <span className={styles.tick} />
                    Page {pageLimit} ends
                  </div>
                  {/* Kept clear of "Page N ends" when only a line or two spill over. */}
                  <div className={`${styles.note} ${styles.strong}`} style={{ top: Math.max((pageEnd + contentEnd) / 2, pageEnd + 24) }}>
                    {lineCount(linesOver)} over
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.bracket} style={{ top: contentEnd, height: pageEnd - contentEnd }} />
                  <div className={styles.note} style={{ top: (contentEnd + pageEnd) / 2 }}>
                    {linesLeft > 0 ? `≈ ${lineCount(linesLeft)} left` : "Page full"}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Editor;
