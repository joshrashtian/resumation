import { useEffect, useRef, useState } from "react";
import MonacoEditor, { BeforeMount } from "@monaco-editor/react";
import { KeyCode, type editor, type IDisposable } from "monaco-editor";
import { FaCheck, FaCopy } from "react-icons/fa6";
import { LuWandSparkles } from "react-icons/lu";
import "../../lib/monaco";
import styles from "./CodeView.module.css";

type CodeViewProps = {
  language: "html" | "json";
  // What the editor shows; a new value replaces the text, which stays undoable.
  code: string;
  description?: string;
  // Makes the code editable, reporting every change.
  onChange?: (code: string) => void;
  // Keeps an editable view read-only for now, e.g. while previewing an old version.
  readOnly?: boolean;
  onBlur?: () => void;
  // Adds language features once the editor is up; they're disposed with it.
  setup?: (editor: editor.IStandaloneCodeEditor) => IDisposable;
};

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function usePrefersDark() {
  const [dark, setDark] = useState(darkQuery.matches);
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    darkQuery.addEventListener("change", onChange);
    return () => darkQuery.removeEventListener("change", onChange);
  }, []);
  return dark;
}

// GitHub-style colours on a clear background, so the glass panel shows through.
const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("resumation-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "tag", foreground: "116329" },
      { token: "delimiter", foreground: "6e7781" },
      { token: "attribute.name", foreground: "953800" },
      { token: "attribute.value", foreground: "0a3069" },
      { token: "string.key.json", foreground: "0550ae" },
      { token: "string.value.json", foreground: "0a3069" },
      { token: "number", foreground: "8250df" },
      { token: "keyword.json", foreground: "cf222e" },
    ],
    colors: {
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
      "editorLineNumber.foreground": "#00000033",
      "editorLineNumber.activeForeground": "#00000080",
      "editorIndentGuide.background1": "#0000000f",
      "editorIndentGuide.activeBackground1": "#00000026",
      "editor.selectionBackground": "#396cd833",
      "editorStickyScroll.background": "#f7f7f7",
      "scrollbarSlider.background": "#00000018",
      "scrollbarSlider.hoverBackground": "#00000030",
    },
  });
  monaco.editor.defineTheme("resumation-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "tag", foreground: "7ee787" },
      { token: "delimiter", foreground: "8b949e" },
      { token: "attribute.name", foreground: "ffa657" },
      { token: "attribute.value", foreground: "a5d6ff" },
      { token: "string.key.json", foreground: "79c0ff" },
      { token: "string.value.json", foreground: "a5d6ff" },
      { token: "number", foreground: "d2a8ff" },
      { token: "keyword.json", foreground: "ff7b72" },
    ],
    colors: {
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
      "editorLineNumber.foreground": "#ffffff33",
      "editorLineNumber.activeForeground": "#ffffff80",
      "editorIndentGuide.background1": "#ffffff12",
      "editorIndentGuide.activeBackground1": "#ffffff2e",
      "editor.selectionBackground": "#396cd866",
      "editorStickyScroll.background": "#262628",
      "scrollbarSlider.background": "#ffffff1a",
      "scrollbarSlider.hoverBackground": "#ffffff33",
    },
  });
};

// Monaco view of the current document's source, editable when given onChange.
const CodeView = ({ language, code, description, onChange, readOnly = false, onBlur, setup }: CodeViewProps) => {
  const [copied, setCopied] = useState(false);
  const dark = usePrefersDark();
  const editable = !!onChange && !readOnly;

  // The text as it stands, edits included, for the line count and Copy.
  const [text, setText] = useState(code);
  useEffect(() => setText(code), [code]);

  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const features = useRef<IDisposable[]>([]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const editableRef = useRef(editable);
  editableRef.current = editable;

  // Runs the language's formatter, if it has one; Monaco drops the result if the text changes meanwhile.
  function format() {
    if (editableRef.current) void editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }
  useEffect(
    () => () => {
      features.current.forEach((feature) => feature.dispose());
      features.current = [];
    },
    [],
  );

  const lineCount = text.split("\n").length;
  const size = new Blob([text]).size;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <section className={styles.codeView}>
      <div className={styles.header}>
        <span className={styles.lang}>{language.toUpperCase()}</span>
        <span className={styles.meta}>
          {lineCount} line{lineCount === 1 ? "" : "s"} · {sizeLabel}
          {description && ` · ${description}`}
        </span>
        {editable && (
          <button className={styles.action} title="Format (⇧⌥F). Also runs when you save or paste." onClick={format}>
            <LuWandSparkles />
            <span>Format</span>
          </button>
        )}
        <button className={styles.action} title="Copy to clipboard" onClick={copy}>
          {copied ? <FaCheck /> : <FaCopy />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className={styles.code}>
        <MonacoEditor
          language={language}
          value={code}
          theme={dark ? "resumation-dark" : "resumation-light"}
          beforeMount={defineThemes}
          onMount={(editor) => {
            editorRef.current = editor;
            features.current.push(
              editor.onDidBlurEditorText(() => onBlurRef.current?.()),
              // Formats as it saves: ⌘S still reaches the app, which saves the document.
              editor.onKeyDown((e) => {
                if (e.keyCode === KeyCode.KeyS && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) format();
              }),
              editor.onDidPaste(format),
            );
            if (setup) features.current.push(setup(editor));
          }}
          onChange={(value = "") => {
            setText(value);
            onChange?.(value);
          }}
          options={{
            readOnly: !editable,
            domReadOnly: !editable,
            readOnlyMessage: { value: onChange ? "Read-only while previewing an old version" : "Read-only" },
            tabSize: 2,
            // Suggestions come from the language (tags, attributes, snippets), not from words already typed.
            wordBasedSuggestions: "off",
            // Resumes are full of en dashes and curly quotes; they shouldn't be boxed as look-alikes.
            unicodeHighlight: { ambiguousCharacters: false },
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 12.5,
            lineHeight: 20,
            padding: { top: 12, bottom: 12 },
            minimap: { enabled: false },
            wordWrap: "on",
            wrappingIndent: "indent",
            folding: true,
            showFoldingControls: "mouseover",
            stickyScroll: { enabled: true },
            bracketPairColorization: { enabled: false },
            guides: { indentation: true, highlightActiveIndentation: true },
            lineNumbersMinChars: 3,
            glyphMargin: false,
            renderLineHighlight: editable ? "line" : "none",
            occurrencesHighlight: "off",
            selectionHighlight: false,
            matchBrackets: editable ? "near" : "never",
            cursorStyle: "line-thin",
            hideCursorInOverviewRuler: true,
            overviewRulerLanes: 0,
            overviewRulerBorder: false,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
            automaticLayout: true,
          }}
        />
      </div>
    </section>
  );
};

export default CodeView;
