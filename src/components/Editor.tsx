import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { ParagraphFormat } from "./extensions/ParagraphFormat";
import { RightTab } from "./extensions/RightTab";
import { PageLimit, contentHeight } from "./extensions/PageLimit";
import { FONTS } from "../fontOptions";
import { DEFAULT_LAYOUT, PageLayout } from "../pageLayout";
import "./Editor.css";
import { Fa1, FaArrowRotateLeft, FaAlignCenter, FaAlignJustify, FaAlignLeft, FaAlignRight, FaArrowRotateRight, FaBold, FaHeading, FaItalic, FaUnderline } from "react-icons/fa6";

// Resume sizes are usually given in points (body text 10–12pt).
const FONT_SIZES = ["8", "9", "10", "10.5", "11", "12", "14", "16", "18", "20", "24", "28", "36"];

const LINE_SPACINGS = [
  { label: "Single", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
];

const ALIGNMENTS = [
  { value: "left", icon: <FaAlignLeft />, title: "Align left" },
  { value: "center", icon: <FaAlignCenter />, title: "Align center" },
  { value: "right", icon: <FaAlignRight />, title: "Align right" },
  { value: "justify", icon: <FaAlignJustify />, title: "Justify" },
];

export type PageStatus = {
  usage: number;
  limitHit: boolean;
};

type EditorProps = {
  content?: string;
  onChange?: (html: string) => void;
  pageLimit?: number;
  layout?: PageLayout;
  onPageStatusChange?: (status: PageStatus) => void;
};

function Editor({ content = "", onChange, pageLimit = 0, layout = DEFAULT_LAYOUT, onPageStatusChange }: EditorProps) {

  const textWidth = layout.width - layout.marginLeft - layout.marginRight;
  const textHeight = layout.height - layout.marginTop - layout.marginBottom;

  const editor = useEditor({
    extensions: [
      StarterKit,
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
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  const [pageUsage, setPageUsage] = useState(0);
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    const maxHeight = pageLimit ? pageLimit * textHeight * 96 : null;
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
      setPageUsage(maxHeight && dom.isConnected ? contentHeight(dom) / maxHeight : 0);
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
  }, [editor, pageLimit, textHeight]);

  const onPageStatusChangeRef = useRef(onPageStatusChange);
  onPageStatusChangeRef.current = onPageStatusChange;
  useEffect(() => {
    onPageStatusChangeRef.current?.({ usage: pageUsage, limitHit });
  }, [pageUsage, limitHit]);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      fontFamily: (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? "",
      fontSize: ((editor.getAttributes("textStyle").fontSize as string | undefined) ?? "").replace("pt", ""),
      lineSpacing:
        (editor.getAttributes("paragraph").lineSpacing as string | null) ??
        (editor.getAttributes("heading").lineSpacing as string | null) ??
        "",
      align: ALIGNMENTS.find((a) => editor.isActive({ textAlign: a.value }))?.value ?? "left",
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });

  return (
    <div
      className={pageLimit ? "editor limited" : "editor"}
      style={
        {
          "--pages": pageLimit,
          "--page-text-width": `${textWidth}in`,
          "--page-text-height": `${textHeight}in`,
          "--doc-font-family": layout.fontFamily,
          "--doc-font-size": layout.fontSize,
        } as React.CSSProperties
      }
    >
      <div className="editor-toolbar">
        <select
          value={state.fontFamily}
          onChange={(e) => {
            const font = e.target.value;
            if (font) editor.chain().focus().setFontFamily(font).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
        >
          <option value="">Default font</option>
          {state.fontFamily && !FONTS.some((f) => f.value === state.fontFamily) && (
            <option value={state.fontFamily}>{state.fontFamily.split(",")[0].replace(/'/g, "")}</option>
          )}
          {FONTS.map((font) => (
            <option key={font.label} value={font.value} style={{ fontFamily: font.value }}>
              {font.label}
            </option>
          ))}
        </select>
        <select
          title="Font size"
          value={state.fontSize}
          onChange={(e) => {
            const size = e.target.value;
            if (size) editor.chain().focus().setFontSize(`${size}pt`).run();
            else editor.chain().focus().unsetFontSize().run();
          }}
        >
          <option value="">Size</option>
          {state.fontSize && !FONT_SIZES.includes(state.fontSize) && <option value={state.fontSize}>{state.fontSize}</option>}
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <select
          title="Line spacing"
          value={state.lineSpacing}
          onChange={(e) => {
            const spacing = e.target.value;
            if (spacing) editor.chain().focus().setLineSpacing(spacing).run();
            else editor.chain().focus().unsetLineSpacing().run();
          }}
        >
          <option value="">Spacing</option>
          {state.lineSpacing && !LINE_SPACINGS.some((s) => s.value === state.lineSpacing) && (
            <option value={state.lineSpacing}>{state.lineSpacing}</option>
          )}
          {LINE_SPACINGS.map((spacing) => (
            <option key={spacing.value} value={spacing.value}>
              {spacing.label}
            </option>
          ))}
        </select>
        {ALIGNMENTS.map((alignment) => (
          <button
            key={alignment.value}
            title={alignment.title}
            className={state.align === alignment.value ? "active" : ""}
            onClick={() => editor.chain().focus().setTextAlign(alignment.value).run()}
          >
            {alignment.icon}
          </button>
        ))}
        <button className={state.bold ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()}>
          <FaBold />
        </button>
        <button className={state.italic ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <FaItalic />
        </button>
        <button className={state.underline ? "active" : ""} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <FaUnderline/>
        </button>
        <button className={state.h1 ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          h1
        </button>
        <button className={state.h2 ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <button className={state.bulletList ? "active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • List
        </button>
        <button className={state.orderedList ? "active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. List
        </button>
        <button disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>
          <FaArrowRotateLeft />
        </button>
        <button disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>
          <FaArrowRotateRight />
        </button>
      </div>
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}

export default Editor;
