import { useEffect, useState } from "react";
import MonacoEditor, { BeforeMount } from "@monaco-editor/react";
import { FaCheck, FaCopy } from "react-icons/fa6";
import "../../lib/monaco";
import styles from "./CodeView.module.css";

type CodeViewProps = {
  language: "html" | "json";
  code: string;
  description?: string;
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

// Read-only Monaco view of the current document's source.
const CodeView = ({ language, code, description }: CodeViewProps) => {
  const [copied, setCopied] = useState(false);
  const dark = usePrefersDark();

  const lineCount = code.split("\n").length;
  const size = new Blob([code]).size;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
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
        <button className={styles.copy} title="Copy to clipboard" onClick={copy}>
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
          options={{
            readOnly: true,
            domReadOnly: true,
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
            renderLineHighlight: "none",
            occurrencesHighlight: "off",
            selectionHighlight: false,
            matchBrackets: "never",
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
