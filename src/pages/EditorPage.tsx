import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router";
import Editor, { PageStatus } from "../components/Editor";
import { docxToHtml } from "../converter";
import { useSettings } from "../settings";
import { DEFAULT_LAYOUT, PageLayout } from "../pageLayout";
import { formatHtml } from "../codeFormat";
import { displayName, isResumationFile, RESUMATION_EXTENSION, ResumationFile } from "../fileTypes";
import {
  Block,
  BLOCKS_EXTENSION,
  BlocksEditor,
  BlocksFile,
  BlocksPicker,
  isBlocksFile,
  newTextBlock,
  normalizeBlocks,
} from "../lib/blocks";
import styles from "./EditorPage.module.css";
import EditorFooter from "../components/EditorFooter";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import FileTree from "../components/FileTree";
import TabBar, { TabItem } from "../components/TabBar";
import CodeView from "../components/CodeView";
import NewFileInput from "../components/NewFileInput";
import VersionHistory, { EMPTY_HISTORY, History, Version } from "../components/VersionHistory";
import { LuBraces, LuCode, LuFileText, LuPlus } from "react-icons/lu";

const SIDEBAR_WIDTH = 240;

// Text Blocks save themselves constantly, so they keep at most one automatic version per file this often.
const AUTO_VERSION_INTERVAL = 5 * 60 * 1000;

type View = "document" | "html" | "json";

const VIEWS: TabItem<View>[] = [
  { id: "document", label: "Document", icon: <LuFileText />, shortcut: "⌘1" },
  { id: "html", label: "Code", icon: <LuCode />, shortcut: "⌘2" },
  { id: "json", label: "JSON", icon: <LuBraces />, shortcut: "⌘3" },
];

type Snapshot = { html: string; json: JSONContent };

type Doc = {
  key: number;
  content: string | JSONContent;
  layout?: PageLayout;
  name?: string;
  // Project folder the document came from, where a first save lands.
  folder?: string;
  // The Resumation Editor File this document saves to, once it has one.
  savePath?: string;
};

type OpenBlocks = { path: string; name: string; blocks: Block[] };

// An old version shown read-only in place of the file, until it's restored or left.
type Preview = { path: string; version: Version };

const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const withoutExtension = (name: string) => name.replace(/\.[^.]+$/, "") || name;

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

type EditorPageProps = { project: string };

function EditorPage({ project }: EditorPageProps) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<Doc>({ key: 0, content: "" });
  // Set while a Text Blocks file is open; it replaces the resume editor.
  const [blocksDoc, setBlocksDoc] = useState<OpenBlocks | null>(null);
  const [creatingFile, setCreatingFile] = useState(false);
  const [tiptap, setTiptap] = useState<TiptapEditor | null>(null);
  const [settings] = useSettings();
  const [pageStatus, setPageStatus] = useState<PageStatus>({ usage: 0, limitHit: false });
  const [leftOpen, toggleLeft] = useStoredToggle("resumation.sidebar.left", true);
  const [rightOpen, toggleRight] = useStoredToggle("resumation.sidebar.right", false);
  const [filesVersion, setFilesVersion] = useState(0);
  const [view, setView] = useState<View>("document");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [versionsVersion, setVersionsVersion] = useState(0);
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);

  // The editor reports every change here. Only copy it into state while a
  // code tab is showing, so typing in the document doesn't re-render App.
  const latest = useRef<Snapshot>({ html: "", json: { type: "doc" } });
  const [snapshot, setSnapshot] = useState<Snapshot>(latest.current);
  const viewRef = useRef(view);
  viewRef.current = view;

  function handleEditorChange(html: string, json: JSONContent) {
    latest.current = { html, json };
    if (viewRef.current !== "document") setSnapshot(latest.current);
  }

  function selectView(next: View) {
    if (next !== "document") setSnapshot(latest.current);
    setView(next);
  }

  const [formattedHtml, setFormattedHtml] = useState("");
  useEffect(() => {
    let cancelled = false;
    formatHtml(snapshot.html)
      .catch((err) => {
        console.error(err);
        return snapshot.html;
      })
      .then((html) => !cancelled && setFormattedHtml(html));
    return () => {
      cancelled = true;
    };
  }, [snapshot.html]);
  const resumeJson = useMemo(
    () => JSON.stringify({ name: doc.name ?? null, layout: doc.layout ?? DEFAULT_LAYOUT, content: snapshot.json }, null, 2),
    [snapshot.json, doc.name, doc.layout],
  );

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
      else if (e.key === "s") saveRef.current();
      else if (e.key >= "1" && e.key <= String(VIEWS.length)) selectView(VIEWS[Number(e.key) - 1].id);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Text Blocks save themselves shortly after each change, and right away
  // before another file opens or the editor closes.
  const unsavedBlocks = useRef<OpenBlocks | null>(null);
  const lastAutoVersion = useRef(new Map<string, number>());

  // Records a version of a saved file. Unchanged contents don't add one, and
  // a failure here never fails the save itself.
  async function saveVersion(path: string, message = "") {
    try {
      await invoke("save_version", { project, name: path, message });
      setVersionsVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
    }
  }

  async function flushBlocks() {
    const pending = unsavedBlocks.current;
    if (!pending) return;
    unsavedBlocks.current = null;
    const file: BlocksFile = { blocks: pending.blocks };
    try {
      await invoke("save_document", { project, name: pending.path, contents: JSON.stringify(file, null, 2) });
      setFilesVersion((v) => v + 1);
      const now = Date.now();
      if (now - (lastAutoVersion.current.get(pending.path) ?? 0) >= AUTO_VERSION_INTERVAL) {
        lastAutoVersion.current.set(pending.path, now);
        await saveVersion(pending.path);
      }
    } catch (err) {
      console.error(err);
      alert(`Couldn't save ${pending.name}.`);
    }
  }
  const flushBlocksRef = useRef(flushBlocks);
  flushBlocksRef.current = flushBlocks;

  function changeBlocks(blocks: Block[]) {
    if (!blocksDoc || preview) return;
    const next = { ...blocksDoc, blocks };
    unsavedBlocks.current = next;
    setBlocksDoc(next);
  }

  useEffect(() => {
    if (!unsavedBlocks.current) return;
    const timer = setTimeout(() => flushBlocksRef.current(), 400);
    return () => clearTimeout(timer);
  }, [blocksDoc]);

  useEffect(() => () => void flushBlocksRef.current(), []);

  async function createBlocksFile(name: string) {
    const file: BlocksFile = { blocks: [newTextBlock()] };
    try {
      const path = await invoke<string>("create_document", {
        project,
        name: `${name}${BLOCKS_EXTENSION}`,
        bytes: Array.from(new TextEncoder().encode(JSON.stringify(file, null, 2))),
      });
      setCreatingFile(false);
      setFilesVersion((v) => v + 1);
      await openDocument(path);
    } catch (err) {
      console.error(err);
      alert(String(err) === "invalid file name" ? "File names can't contain slashes." : `Couldn't create ${name}.`);
    }
  }

  // Converts first so a file that isn't a valid .docx never lands in the project.
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let converted: Awaited<ReturnType<typeof docxToHtml>>;
    try {
      converted = await docxToHtml(file);
    } catch (err) {
      console.error(err);
      alert(`Couldn't open ${file.name}. Make sure it's a Word .docx file.`);
      return;
    }
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const path = await invoke<string>("create_document", { project, name: file.name, bytes });
      setFilesVersion((v) => v + 1);
      setBlocksDoc(null);
      setDoc((prev) => ({ key: prev.key + 1, content: converted.html, layout: converted.layout, name: path.split("/").pop() }));
    } catch (err) {
      console.error(err);
      alert(`Couldn't add ${file.name} to ${project}.`);
    }
  }

  // Word files can't be written back, so documents save as a Resumation Editor
  // File next to where they came from; later saves overwrite that file. Every
  // save also records a version, named when a message is given.
  async function save(message = "") {
    if (preview) return;
    if (blocksDoc) {
      await flushBlocks();
      return saveVersion(blocksDoc.path, message);
    }
    const saved: ResumationFile = {
      name: doc.name ?? null,
      layout: doc.layout ?? DEFAULT_LAYOUT,
      content: latest.current.json,
    };
    const contents = JSON.stringify(saved, null, 2);
    try {
      let savePath = doc.savePath;
      if (savePath) {
        await invoke("save_document", { project, name: savePath, contents });
      } else {
        const name = `${withoutExtension(doc.name ?? "Untitled")}${RESUMATION_EXTENSION}`;
        const bytes = Array.from(new TextEncoder().encode(contents));
        savePath = await invoke<string>("create_document", { project, folder: doc.folder, name, bytes });
        setDoc((prev) => ({ ...prev, savePath, name: displayName(savePath!.split("/").pop()!) }));
      }
      setFilesVersion((v) => v + 1);
      await saveVersion(savePath, message);
    } catch (err) {
      console.error(err);
      alert(`Couldn't save to ${project}.`);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;

  async function openDocument(path: string) {
    const name = path.split("/").pop() ?? path;
    const ext = name.toLowerCase().split(".").pop();
    await flushBlocks();
    setPreview(null);
    try {
      if (isBlocksFile(name)) {
        const file: BlocksFile = JSON.parse(await invoke<string>("read_document", { project, name: path }));
        const blocks = file.blocks?.length ? normalizeBlocks(file.blocks) : [newTextBlock()];
        setBlocksDoc({ path, name: displayName(name), blocks });
        // Records how the file looked when opened, so the first edits can be undone from history.
        void saveVersion(path);
      } else if (ext === "docx") {
        const bytes = await invoke<ArrayBuffer>("read_document_bytes", { project, name: path });
        const { html, layout } = await docxToHtml(new File([bytes], name));
        setBlocksDoc(null);
        setDoc((prev) => ({ key: prev.key + 1, content: html, layout, name, folder: folderOf(path) }));
      } else if (isResumationFile(name)) {
        const saved: ResumationFile = JSON.parse(await invoke<string>("read_document", { project, name: path }));
        setBlocksDoc(null);
        setDoc((prev) => ({ key: prev.key + 1, content: saved.content, layout: saved.layout, name: displayName(name), savePath: path }));
        void saveVersion(path);
      } else if (ext === "html" || ext === "htm" || ext === "txt") {
        const html = await invoke<string>("read_document", { project, name: path });
        setBlocksDoc(null);
        setDoc((prev) => ({ key: prev.key + 1, content: html, name, folder: folderOf(path) }));
      } else {
        alert(`Resumation can't open ${name}. It opens Word, Resumation Editor, Text Blocks and HTML files.`);
      }
    } catch (err) {
      console.error(err);
      alert(`Couldn't open ${name}.`);
    }
  }

  // The file the version history belongs to; documents only get one once saved.
  const versionPath = blocksDoc?.path ?? doc.savePath ?? null;

  useEffect(() => {
    if (!versionPath) return setHistory(EMPTY_HISTORY);
    let cancelled = false;
    invoke<History>("list_versions", { project, name: versionPath })
      .then((h) => !cancelled && setHistory(h))
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [project, versionPath, versionsVersion]);
  const hasVariants = Object.keys(history.heads).length > 1;

  // Saves the current state first, so nothing typed is lost while the old version shows.
  async function previewVersion(version: Version) {
    if (!versionPath) return;
    if (!preview) await save();
    try {
      const bytes = await invoke<ArrayBuffer>("read_version", { project, name: versionPath, id: version.id });
      const text = new TextDecoder().decode(bytes);
      if (blocksDoc) {
        const file: BlocksFile = JSON.parse(text);
        setBlocksDoc({ ...blocksDoc, blocks: file.blocks?.length ? normalizeBlocks(file.blocks) : [newTextBlock()] });
      } else {
        const saved: ResumationFile = JSON.parse(text);
        setDoc((prev) => ({ ...prev, key: prev.key + 1, content: saved.content, layout: saved.layout }));
      }
      setPreview({ path: versionPath, version });
    } catch (err) {
      console.error(err);
      alert(`Couldn't open version ${version.id}.`);
    }
  }

  // Reopening from disk shows the file as it is now.
  async function leavePreview() {
    if (preview) await openDocument(preview.path);
  }

  async function restorePreview() {
    if (!preview) return;
    try {
      await invoke("restore_version", { project, name: preview.path, id: preview.version.id });
      setFilesVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      alert(`Couldn't restore version ${preview.version.id}.`);
      return;
    }
    await leavePreview();
  }

  // Both save what's in the editor first and then reopen the file, which then
  // holds the variant's contents.
  async function createVariant(variant: string) {
    if (!versionPath) return;
    if (!preview) await save();
    try {
      await invoke("create_document_variant", { project, name: versionPath, variant });
    } catch (err) {
      console.error(err);
      alert(String(err) === "variant exists" ? `There's already a variant called ${variant}.` : `Couldn't create ${variant}.`);
      return;
    }
    await openDocument(versionPath);
  }

  async function switchVariant(variant: string) {
    if (!versionPath) return;
    if (!preview) await save();
    try {
      await invoke("switch_document_variant", { project, name: versionPath, variant });
      setFilesVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      alert(`Couldn't switch to ${variant}.`);
      return;
    }
    await openDocument(versionPath);
  }

  const sidebarSpace = (open: boolean) => (open ? `${SIDEBAR_WIDTH + 24}px` : "0px");

  return (
    <div
      className={styles.app}
      style={
        {
          "--sidebar-width": `${SIDEBAR_WIDTH}px`,
          "--left-space": sidebarSpace(leftOpen),
          "--right-space": sidebarSpace(rightOpen),
        } as React.CSSProperties
      }
    >
      <Header
        projectName={project}
        fileName={[blocksDoc?.name ?? doc.name, hasVariants && history.variant].filter(Boolean).join(" · ") || undefined}
        onHome={() => navigate("/")}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={toggleLeft}
        onToggleRight={toggleRight}
        onUpload={() => fileInput.current?.click()}
        onSave={() => save()}
        onSettings={() => invoke("open_settings_page")}
      />

      <Sidebar
        side="left"
        open={leftOpen}
        title="Documents"
        action={
          <button title="New Text Blocks file" aria-pressed={creatingFile} onClick={() => setCreatingFile((c) => !c)}>
            <LuPlus />
          </button>
        }
      >
        {creatingFile && (
          <NewFileInput placeholder="Text Blocks name" onSubmit={createBlocksFile} onCancel={() => setCreatingFile(false)} />
        )}
        {leftOpen && <FileTree project={project} refreshKey={filesVersion} onOpenFile={openDocument} />}
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
        <h3 className={styles.sidebarHeading}>Versions</h3>
        {rightOpen && (
          <VersionHistory
            saved={!!versionPath}
            history={history}
            previewId={preview?.version.id ?? null}
            onSaveNamed={(message) => save(message)}
            onPreview={previewVersion}
            onCreateVariant={createVariant}
            onSwitchVariant={switchVariant}
          />
        )}
        <h3 className={styles.sidebarHeading}>Text Blocks</h3>
        {rightOpen && <BlocksPicker project={project} refreshKey={filesVersion} editor={blocksDoc || preview ? null : tiptap} />}
      </Sidebar>

      <main className={styles.main}>
        <input
          ref={fileInput}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleUpload}
          hidden
        />
        {preview && (
          <div className={styles.previewBar}>
            <span>
              Previewing <strong>{preview.version.message || `Version ${preview.version.id}`}</strong>
            </span>
            <button onClick={restorePreview}>Restore this version</button>
            <button onClick={leavePreview}>Back to current</button>
          </div>
        )}
        {blocksDoc && (
          // A disabled fieldset makes every field in the blocks read-only while previewing.
          <fieldset className={styles.blocksFrame} disabled={!!preview}>
            <BlocksEditor key={`${blocksDoc.path}:${preview?.version.id ?? ""}`} blocks={blocksDoc.blocks} onChange={changeBlocks} />
          </fieldset>
        )}
        <div hidden={!!blocksDoc}>
          <TabBar tabs={VIEWS} active={view} onSelect={selectView} />
          {/* Kept mounted while hidden so undo history and selection survive tab switches. */}
          <div hidden={view !== "document"}>
            <Editor
              key={doc.key}
              content={doc.content}
              pageLimit={settings.pageLimit}
              layout={doc.layout}
              onChange={handleEditorChange}
              onPageStatusChange={setPageStatus}
              onReady={setTiptap}
              editable={!preview}
            />
          </div>
          {view === "html" && <CodeView language="html" code={formattedHtml} description="editor.getHTML()" />}
          {view === "json" && <CodeView language="json" code={resumeJson} description="name, layout, editor.getJSON()" />}
        </div>
      </main>
      {!blocksDoc && <EditorFooter pageLimit={settings.pageLimit} status={pageStatus} />}
    </div>
  );
}

export default EditorPage;
