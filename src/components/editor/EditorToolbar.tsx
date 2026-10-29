import { ReactNode, useEffect, useRef, useState } from "react";
import { useEditorState, type Editor as TiptapEditor } from "@tiptap/react";
import {
  LuAlignCenter,
  LuAlignJustify,
  LuAlignLeft,
  LuAlignRight,
  LuArrowRightToLine,
  LuBold,
  LuCheck,
  LuChevronDown,
  LuItalic,
  LuLink,
  LuList,
  LuUnderline,
} from "react-icons/lu";
import { FONTS } from "../../lib/fontOptions";
import styles from "./EditorToolbar.module.css";

// Resume sizes are usually given in points (body text 10–12pt).
const FONT_SIZES = ["8", "9", "10", "10.5", "11", "12", "14", "16", "18", "20", "24", "28", "36"];

const LINE_SPACINGS = [
  { label: "Single", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
];

const ALIGNMENTS = [
  { value: "left", icon: <LuAlignLeft />, title: "Align left" },
  { value: "center", icon: <LuAlignCenter />, title: "Align center" },
  { value: "right", icon: <LuAlignRight />, title: "Align right" },
  { value: "justify", icon: <LuAlignJustify />, title: "Justify" },
];

type BlockType = "paragraph" | "h1" | "h2" | "bullet" | "numbered";

const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: "paragraph", label: "Text" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "bullet", label: "Bullet" },
  { value: "numbered", label: "Numbered" },
];

// The first name in a CSS font stack, e.g. "EB Garamond" from "'EB Garamond', serif".
const familyName = (stack: string) => stack.split(",")[0].replace(/['"]/g, "").trim();

function setBlockType(editor: TiptapEditor, type: BlockType) {
  const chain = editor.chain().focus();
  // Leave any list first so the line becomes a plain paragraph to convert.
  if (type !== "bullet" && editor.isActive("bulletList")) chain.toggleBulletList();
  if (type !== "numbered" && editor.isActive("orderedList")) chain.toggleOrderedList();
  if (type === "paragraph") chain.setParagraph();
  else if (type === "h1") chain.setHeading({ level: 1 });
  else if (type === "h2") chain.setHeading({ level: 2 });
  else {
    chain.setParagraph();
    if (type === "bullet" && !editor.isActive("bulletList")) chain.toggleBulletList();
    if (type === "numbered" && !editor.isActive("orderedList")) chain.toggleOrderedList();
  }
  chain.run();
}

// A toolbar button that opens a panel below it; clicking outside or Escape closes it.
function Popover({
  trigger,
  title,
  className,
  children,
}: {
  trigger: ReactNode;
  title?: string;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.popoverWrap} ref={ref}>
      <button
        title={title}
        aria-expanded={open}
        className={[className, open ? styles.open : ""].join(" ")}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && <div className={styles.popover}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function MenuItem({ selected, onClick, style, children }: { selected?: boolean; onClick: () => void; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <button className={styles.menuItem} style={style} onClick={onClick}>
      <span>{children}</span>
      {selected && <LuCheck />}
    </button>
  );
}

function LinkForm({ editor, close }: { editor: TiptapEditor; close: () => void }) {
  const [href, setHref] = useState(() => (editor.getAttributes("link").href as string | undefined) ?? "");
  const apply = () => {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    (url ? chain.setLink({ href: url }) : chain.unsetLink()).run();
    close();
  };
  return (
    <form
      className={styles.linkForm}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <input autoFocus placeholder="https://" value={href} onChange={(e) => setHref(e.target.value)} />
      <button type="submit">{href.trim() ? "Apply" : "Remove"}</button>
    </form>
  );
}

type EditorToolbarProps = {
  editor: TiptapEditor;
  // The document's base font, shown when the text has no font of its own.
  defaultFont?: string;
  defaultSize?: string;
};

function EditorToolbar({ editor, defaultFont, defaultSize }: EditorToolbarProps) {
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
      blockType: (editor.isActive("orderedList")
        ? "numbered"
        : editor.isActive("bulletList")
          ? "bullet"
          : editor.isActive("heading", { level: 1 })
            ? "h1"
            : editor.isActive("heading", { level: 2 })
              ? "h2"
              : "paragraph") as BlockType,
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      link: editor.isActive("link"),
    }),
  });

  const fontStack = state.fontFamily || defaultFont || "";
  const fontLabel = fontStack ? familyName(fontStack) : "Default";
  const sizeLabel = state.fontSize || (defaultSize ?? "11pt").replace("pt", "");
  const alignIcon = ALIGNMENTS.find((a) => a.value === state.align)!.icon;

  return (
    <div className={styles.toolbar}>
      <Popover
        title="Block type"
        className={styles.select}
        trigger={
          <>
            {BLOCK_TYPES.find((t) => t.value === state.blockType)!.label}
            <LuChevronDown className={styles.chevron} />
          </>
        }
      >
        {(close) =>
          BLOCK_TYPES.map((type) => (
            <MenuItem
              key={type.value}
              selected={state.blockType === type.value}
              onClick={() => {
                setBlockType(editor, type.value);
                close();
              }}
            >
              {type.label}
            </MenuItem>
          ))
        }
      </Popover>

      <Popover
        title="Font and size"
        className={styles.select}
        trigger={
          <>
            <span style={{ fontFamily: fontStack || undefined }}>
              {fontLabel} · {sizeLabel}
            </span>
            <LuChevronDown className={styles.chevron} />
          </>
        }
      >
        {(close) => (
          <div className={styles.fontPanel}>
            <div className={styles.fontList}>
              <MenuItem
                selected={!state.fontFamily}
                onClick={() => {
                  editor.chain().focus().unsetFontFamily().run();
                  close();
                }}
              >
                Document default
              </MenuItem>
              {FONTS.map((font) => (
                <MenuItem
                  key={font.label}
                  style={{ fontFamily: font.value }}
                  selected={state.fontFamily === font.value}
                  onClick={() => {
                    editor.chain().focus().setFontFamily(font.value).run();
                    close();
                  }}
                >
                  {font.label}
                </MenuItem>
              ))}
            </div>
            <div className={styles.sizeGrid}>
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  className={state.fontSize === size ? styles.active : ""}
                  onClick={() => editor.chain().focus().setFontSize(`${size}pt`).run()}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}
      </Popover>

      <span className={styles.divider} />

      <button title="Bold (⌘B)" className={state.bold ? styles.active : ""} onClick={() => editor.chain().focus().toggleBold().run()}>
        <LuBold />
      </button>
      <button title="Italic (⌘I)" className={state.italic ? styles.active : ""} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <LuItalic />
      </button>
      <button title="Underline (⌘U)" className={state.underline ? styles.active : ""} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <LuUnderline />
      </button>
      <Popover title="Link" className={state.link ? styles.active : ""} trigger={<LuLink />}>
        {(close) => <LinkForm editor={editor} close={close} />}
      </Popover>

      <span className={styles.divider} />

      <button
        title="Bullet list"
        className={state.blockType === "bullet" ? styles.active : ""}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <LuList />
      </button>
      <button title="Indent (Tab) · Outdent (⇧Tab)" onClick={() => editor.chain().focus().indent().run()}>
        <LuArrowRightToLine />
      </button>
      <Popover title="Alignment and spacing" trigger={alignIcon}>
        {() => (
          <div className={styles.alignPanel}>
            <div className={styles.alignRow}>
              {ALIGNMENTS.map((alignment) => (
                <button
                  key={alignment.value}
                  title={alignment.title}
                  className={state.align === alignment.value ? styles.active : ""}
                  onClick={() => editor.chain().focus().setTextAlign(alignment.value).run()}
                >
                  {alignment.icon}
                </button>
              ))}
            </div>
            <div className={styles.panelLabel}>Line spacing</div>
            {LINE_SPACINGS.map((spacing) => (
              <MenuItem
                key={spacing.value}
                selected={state.lineSpacing === spacing.value}
                onClick={() => editor.chain().focus().setLineSpacing(spacing.value).run()}
              >
                {spacing.label}
              </MenuItem>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}

export default EditorToolbar;
