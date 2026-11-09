import { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FaFileWord, FaTrash } from "react-icons/fa6";
import { LuChevronRight, LuFileText, LuFileType, LuFolder, LuGitBranch, LuList } from "react-icons/lu";
import { displayName, isResumationFile } from "../../lib/fileTypes";
import { isBlocksFile } from "../../lib/blocks";
import { useContextMenu } from "../../contexts/ContextMenuContext";
import { usePopUp } from "../../contexts/PopUpContext";
import type { History } from "./VersionHistory";
import styles from "./FileTree.module.css";

export type Entry = {
  name: string;
  path: string;
  is_dir: boolean;
};

type FileTreeProps = {
  project: string;
  // Bumped when files change on disk, and when a version or variant is saved.
  refreshKey: number;
  versionsKey: number;
  // The project file open in the editor, if it has one.
  openPath: string | null;
  // An unsaved document is open; it's listed as "Untitled" at the top of Resumes.
  draft: boolean;
  onOpenFile: (path: string) => void;
  // Opens a resume on one of its variants.
  onOpenVariant: (path: string, variant: string) => void;
  onDeleted?: (path: string) => void;
};

type Tree = Omit<FileTreeProps, "draft"> & {
  expanded: Set<string>;
  toggle: (path: string) => void;
};

const TreeContext = createContext<Tree | null>(null);
const useTree = () => useContext(TreeContext)!;

const kind = (entry: Entry) =>
  entry.is_dir ? "folder" : isResumationFile(entry.name) ? "resume" : isBlocksFile(entry.name) ? "blocks" : "import";

function fileTitle(name: string) {
  if (isResumationFile(name)) return `${displayName(name)} — Resumation Editor File`;
  if (isBlocksFile(name)) return `${displayName(name)} — Text Blocks`;
  return name;
}

// The files in one folder of the project, or null until they've loaded.
function useEntries(project: string, folder: string | undefined, refreshKey: number) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    invoke<Entry[]>("list_documents", { project, folder })
      .then((list) => {
        setEntries(list);
        setError(false);
      })
      .catch(() => setError(true));
  }, [project, folder, refreshKey]);
  return { entries, error };
}

// A resume's variants, Main first, and the one its file on disk holds.
function useVariants(path: string) {
  const { project, refreshKey, versionsKey } = useTree();
  const [variants, setVariants] = useState<{ names: string[]; current: string }>({ names: ["Main"], current: "Main" });
  useEffect(() => {
    let cancelled = false;
    invoke<History>("list_versions", { project, name: path })
      .then(({ variant, heads }) => {
        const names = Object.keys(heads).includes(variant) ? Object.keys(heads) : [variant, ...Object.keys(heads)];
        names.sort((a, b) => (a === "Main" ? -1 : b === "Main" ? 1 : a.localeCompare(b)));
        if (!cancelled) setVariants({ names, current: variant });
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [project, path, refreshKey, versionsKey]);
  return variants;
}

const Twist = ({ open, hidden }: { open?: boolean; hidden?: boolean }) => (
  <LuChevronRight className={`${styles.twist}${open ? ` ${styles.open}` : ""}${hidden ? ` ${styles.none}` : ""}`} aria-hidden />
);

function useFileMenu(entry: Entry) {
  const { project, onOpenFile, onDeleted } = useTree();
  const { createContext: openMenu } = useContextMenu();
  const popUp = usePopUp();

  const confirmDelete = () =>
    popUp.open({
      title: `Delete "${displayName(entry.name)}"?`,
      desc: "This file will be permanently removed from the project.",
      onConfirm: () =>
        invoke("delete_document", { project, name: entry.path })
          .then(() => onDeleted?.(entry.path))
          .catch((err) => alert(`Couldn't delete ${entry.name}: ${err}`)),
    });

  return (e: React.MouseEvent) =>
    openMenu(e, [
      { name: "Open", function: () => onOpenFile(entry.path), icon: <FaFileWord /> },
      { name: "Delete", function: confirmDelete, icon: <FaTrash />, danger: true },
    ]);
}

// A resume with one variant is a single row; with more it expands to list them.
function ResumeRow({ entry }: { entry: Entry }) {
  const { openPath, expanded, toggle, onOpenFile, onOpenVariant } = useTree();
  const menu = useFileMenu(entry);
  const { names, current } = useVariants(entry.path);
  const isOpen = openPath === entry.path;

  if (names.length < 2) {
    return (
      <li>
        <button
          className={isOpen ? `${styles.row} ${styles.on}` : styles.row}
          aria-current={isOpen ? "page" : undefined}
          title={fileTitle(entry.name)}
          onClick={() => !isOpen && onOpenFile(entry.path)}
          onContextMenu={menu}
        >
          <Twist hidden />
          <LuFileText className={styles.icon} />
          <span className={styles.name}>{displayName(entry.name)}</span>
        </button>
      </li>
    );
  }

  const shown = expanded.has(entry.path);
  return (
    <li>
      <button
        className={isOpen ? `${styles.row} ${styles.holdsOpen}` : styles.row}
        aria-expanded={shown}
        title={fileTitle(entry.name)}
        onClick={() => toggle(entry.path)}
        onContextMenu={menu}
      >
        <Twist open={shown} />
        <LuFileText className={styles.icon} />
        <span className={styles.name}>{displayName(entry.name)}</span>
        <span className={styles.meta}>{names.length}</span>
      </button>
      {shown && (
        <ul className={styles.list}>
          {names.map((variant) => {
            const on = isOpen && variant === current;
            return (
              <li key={variant}>
                <button
                  className={on ? `${styles.row} ${styles.variant} ${styles.on}` : `${styles.row} ${styles.variant}`}
                  aria-current={on ? "page" : undefined}
                  title={`${displayName(entry.name)} — ${variant}`}
                  onClick={() => !on && onOpenVariant(entry.path, variant)}
                >

                  <LuGitBranch className={styles.icon} />
                  <span className={styles.name}>{variant}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function FileRow({ entry }: { entry: Entry }) {
  const { openPath, onOpenFile } = useTree();
  const menu = useFileMenu(entry);
  const isOpen = openPath === entry.path;
  const Icon = isBlocksFile(entry.name) ? LuList : LuFileType;
  return (
    <li>
      <button
        className={isOpen ? `${styles.row} ${styles.on}` : styles.row}
        aria-current={isOpen ? "page" : undefined}
        title={fileTitle(entry.name)}
        onClick={() => !isOpen && onOpenFile(entry.path)}
        onContextMenu={menu}
      >
        <Twist hidden />
        <Icon className={styles.icon} />
        <span className={styles.name}>{displayName(entry.name)}</span>
      </button>
    </li>
  );
}

function FolderRow({ entry }: { entry: Entry }) {
  const { expanded, toggle } = useTree();
  const { createContext: openMenu } = useContextMenu();
  const shown = expanded.has(entry.path);
  return (
    <li>
      <button
        className={styles.row}
        aria-expanded={shown}
        title={entry.name}
        onClick={() => toggle(entry.path)}
        onContextMenu={(e) => openMenu(e, [{ name: shown ? "Collapse" : "Expand", function: () => toggle(entry.path) }])}
      >
        <Twist open={shown} />
        <LuFolder className={styles.icon} />
        <span className={styles.name}>{entry.name}</span>
      </button>
      {shown && <FolderContents folder={entry.path} />}
    </li>
  );
}

const EntryRow = ({ entry }: { entry: Entry }) => {
  const k = kind(entry);
  if (k === "folder") return <FolderRow entry={entry} />;
  if (k === "resume") return <ResumeRow entry={entry} />;
  return <FileRow entry={entry} />;
};

function FolderContents({ folder }: { folder: string }) {
  const { project, refreshKey } = useTree();
  const { entries, error } = useEntries(project, folder, refreshKey);
  if (error || !entries) return null;
  if (!entries.length) return <p className={`${styles.empty} ${styles.nested}`}>Empty folder</p>;
  return (
    <ul className={`${styles.list} ${styles.nested}`}>
      {entries.map((entry) => (
        <EntryRow key={entry.path} entry={entry} />
      ))}
    </ul>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [shut, setShut] = useState(false);
  return (
    <section>
      <button className={styles.section} aria-expanded={!shut} onClick={() => setShut((s) => !s)}>
        <Twist open={!shut} />
        {label}
        <span className={styles.count}>{count}</span>
      </button>
      {!shut && <ul className={styles.list}>{children}</ul>}
    </section>
  );
}

const FileTree = ({ draft, ...props }: FileTreeProps) => {
  const { entries, error } = useEntries(props.project, undefined, props.refreshKey);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

    const { openPath } = props;
  useEffect(() => {
    if (openPath) setExpanded((prev) => (prev.has(openPath) ? prev : new Set(prev).add(openPath)));
  }, [openPath]);

  if (error) return <p className={styles.empty}>Couldn't read the documents folder.</p>;
  if (!entries) return null;
  if (!entries.length && !draft) return <p className={styles.empty}>No documents yet.</p>;

  const of = (k: ReturnType<typeof kind>) => entries.filter((e) => kind(e) === k);
  const resumes = of("resume");
  const blocks = of("blocks");
  const imports = of("import");
  const folders = of("folder");

  return (
    <TreeContext.Provider value={{ ...props, expanded, toggle }}>
      <div className={styles.tree}>
        {(resumes.length > 0 || draft) && (
          <Section label="Resumes" count={resumes.length + (draft ? 1 : 0)}>
            {draft && (
              <li>
                <button className={`${styles.row} ${styles.on} ${styles.draft}`} aria-current="page" title="Not saved yet">
                  <Twist hidden />
                  <LuFileText className={styles.icon} />
                  <span className={styles.name}>Untitled</span>
                  <span className={styles.dirty} />
                </button>
              </li>
            )}
            {resumes.map((entry) => (
              <ResumeRow key={entry.path} entry={entry} />
            ))}
          </Section>
        )}
        {blocks.length > 0 && (
          <Section label="Text blocks" count={blocks.length}>
            {blocks.map((entry) => (
              <FileRow key={entry.path} entry={entry} />
            ))}
          </Section>
        )}
        {imports.length > 0 && (
          <Section label="Imports" count={imports.length}>
            {imports.map((entry) => (
              <FileRow key={entry.path} entry={entry} />
            ))}
          </Section>
        )}
        {folders.length > 0 && (
          <Section label="Folders" count={folders.length}>
            {folders.map((entry) => (
              <FolderRow key={entry.path} entry={entry} />
            ))}
          </Section>
        )}
      </div>
    </TreeContext.Provider>
  );
};

export default FileTree;
