import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor, { PageStatus } from "./components/Editor";
import SettingsPage from "./components/SettingsPage";
import { docxToHtml } from "./converter";
import { useSettings } from "./settings";
import { PageLayout } from "./pageLayout";
import "./App.css";
import { FaGear, FaUpload } from "react-icons/fa6";
import { LuPanelLeft, LuPanelRight } from "react-icons/lu";
import EditorFooter from "./components/EditorFooter";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import FileTree from "./components/FileTree";

const SIDEBAR_WIDTH = 240;

// Remembers whether a sidebar is open across launches (per window, best effort).
function useStoredToggle(key: string, initial: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : stored === "true";
    } catch {
      return initial;
    }
  });
  const toggle = () =>
    setValue((prev) => {
      try {
        localStorage.setItem(key, String(!prev));
      } catch {}
      return !prev;
    });
  return [value, toggle];
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<{ key: number; html: string; layout?: PageLayout }>({ key: 0, html: "" });
  const [settings] = useSettings();
  const [pageStatus, setPageStatus] = useState<PageStatus>({ usage: 0, limitHit: false });
  const [leftOpen, toggleLeft] = useStoredToggle("resumation.sidebar.left", true);
  const [rightOpen, toggleRight] = useStoredToggle("resumation.sidebar.right", false);
  const [filesVersion, setFilesVersion] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.transparency = settings.transparency ? "on" : "off";
  }, [settings.transparency]);

  useEffect(() => {
    const refresh = () => setFilesVersion((v) => v + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key === "[") toggleLeft();
      else if (e.key === "]") toggleRight();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (window.location.hash === "#/settings") {
    return <SettingsPage />;
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { html, layout } = await docxToHtml(file);
      setDoc((prev) => ({ key: prev.key + 1, html, layout }));
    } catch (err) {
      console.error(err);
      alert(`Couldn't open ${file.name}. Make sure it's a Word .docx file.`);
    }
  }

  async function openDocument(path: string) {
    const name = path.split("/").pop() ?? path;
    const ext = name.toLowerCase().split(".").pop();
    try {
      if (ext === "docx") {
        const bytes = await invoke<ArrayBuffer>("read_document_bytes", { name: path });
        const { html, layout } = await docxToHtml(new File([bytes], name));
        setDoc((prev) => ({ key: prev.key + 1, html, layout }));
      } else if (ext === "html" || ext === "htm" || ext === "txt") {
        const html = await invoke<string>("read_document", { name: path });
        setDoc((prev) => ({ key: prev.key + 1, html }));
      } else {
        alert(`Resumation can't open ${name}. It opens Word (.docx) and HTML files.`);
      }
    } catch (err) {
      console.error(err);
      alert(`Couldn't open ${name}.`);
    }
  }

  const sidebarSpace = (open: boolean) => (open ? `${SIDEBAR_WIDTH + 24}px` : "0px");

  return (
    <div
      className="app"
      style={
        {
          "--sidebar-width": `${SIDEBAR_WIDTH}px`,
          "--left-space": sidebarSpace(leftOpen),
          "--right-space": sidebarSpace(rightOpen),
        } as React.CSSProperties
      }
    >
      <Header />

      <button
        title={`${leftOpen ? "Hide" : "Show"} documents (⌘[)`}
        className="sidebar-toggle left"
        aria-pressed={leftOpen}
        onClick={toggleLeft}
      >
        <LuPanelLeft />
      </button>
      <button
        title={`${rightOpen ? "Hide" : "Show"} details (⌘])`}
        className="sidebar-toggle right"
        aria-pressed={rightOpen}
        onClick={toggleRight}
      >
        <LuPanelRight />
      </button>
      <button title="Settings" className="settings_button" onClick={() => invoke("open_settings_page")}>
        <FaGear />
      </button>

      <Sidebar side="left" open={leftOpen} title="Documents">
        {leftOpen && <FileTree refreshKey={filesVersion} onOpenFile={openDocument} />}
      </Sidebar>

      <Sidebar side="right" open={rightOpen} title="Details">
        <dl>
          <dt>Page limit</dt>
          <dd>{settings.pageLimit ? `${settings.pageLimit} page${settings.pageLimit === 1 ? "" : "s"}` : "None"}</dd>
          {settings.pageLimit > 0 && (
            <>
              <dt>Used</dt>
              <dd>{Math.round(pageStatus.usage * 100)}%</dd>
            </>
          )}
        </dl>
      </Sidebar>

      <main className="main">
        <input
          ref={fileInput}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleUpload}
          hidden
        />
        <button title="Open Word document" className="upload_button" onClick={() => fileInput.current?.click()}>
          <FaUpload />
        </button>
        <Editor
          key={doc.key}
          content={doc.html}
          pageLimit={settings.pageLimit}
          layout={doc.layout}
          onPageStatusChange={setPageStatus}
        />
      </main>
      <EditorFooter pageLimit={settings.pageLimit} status={pageStatus} />
    </div>
  );
}

export default App;
