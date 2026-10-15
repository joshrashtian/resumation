import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor, { PageStatus } from "./components/Editor";
import SettingsPage from "./components/SettingsPage";
import { docxToHtml } from "./converter";
import { useSettings } from "./settings";
import { PageLayout } from "./pageLayout";
import "./App.css";
import { FaGear, FaPencil, FaUpload } from "react-icons/fa6";
import EditorFooter from "./components/EditorFooter";

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  // Bumping the key remounts the editor so it starts fresh with the new content.
  const [doc, setDoc] = useState<{ key: number; html: string; layout?: PageLayout }>({ key: 0, html: "" });
  const [settings] = useSettings();
  const [pageStatus, setPageStatus] = useState<PageStatus>({ usage: 0, limitHit: false });

  if (window.location.hash === "#/settings") {
    return <SettingsPage />;
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    try {
      const { html, layout } = await docxToHtml(file);
      setDoc((prev) => ({ key: prev.key + 1, html, layout }));
    } catch (err) {
      console.error(err);
      alert(`Couldn't open ${file.name}. Make sure it's a Word .docx file.`);
    }
  }

  return (
    <div>
      <h1> <FaPencil /> Resume Builder</h1>
      <input
        ref={fileInput}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleUpload}
        hidden
      />
      <button title="Open Word document" onClick={() => fileInput.current?.click()}>
        <FaUpload />
      </button>
      <button title="Settings" className="settings_button" onClick={() => invoke("open_settings_page")}>
        <FaGear />
      </button>
      <Editor
        key={doc.key}
        content={doc.html}
        pageLimit={settings.pageLimit}
        layout={doc.layout}
        onPageStatusChange={setPageStatus}
      />
      <EditorFooter pageLimit={settings.pageLimit} status={pageStatus} />
    </div>
  );
}

export default App;
