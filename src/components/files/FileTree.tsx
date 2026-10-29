import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FaChevronDown, FaChevronRight, FaFileWord, FaListUl, FaPencil, FaRegFileLines, FaRegFolder, FaTrash } from "react-icons/fa6";
import { displayName, isResumationFile } from "../../lib/fileTypes";
import { isBlocksFile } from "../../lib/blocks";
import { useContextMenu } from "../../contexts/ContextMenuContext";
import { usePopUp } from "../../contexts/PopUpContext";
import styles from "./FileTree.module.css";

export type Entry = {
  name: string;
  path: string;
  is_dir: boolean;
};

type FolderProps = {
  project: string;
  folder?: string;

  refreshKey: number;
  onOpenFile: (path: string) => void;
  onDeleted?: (path: string) => void;
};

const FileIcon = ({ name }: { name: string }) => {
  if (isResumationFile(name)) return <FaPencil className={styles.resumation} />;
  if (isBlocksFile(name)) return <FaListUl className={styles.resumation} />;
  if (name.toLowerCase().endsWith(".docx")) return <FaFileWord />;
  return <FaRegFileLines />;
};

function fileTitle(name: string) {
  if (isResumationFile(name)) return `${displayName(name)} — Resumation Editor File`;
  if (isBlocksFile(name)) return `${displayName(name)} — Text Blocks`;
  return name;
}

const FileTree = ({ project, folder, refreshKey, onOpenFile, onDeleted }: FolderProps) => {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { createContext } = useContextMenu();
  const popUp = usePopUp();

  useEffect(() => {
    invoke<Entry[]>("list_documents", { project, folder })
      .then((list) => {
        setEntries(list);
        setError(null);
      })
      .catch((err) => setError(String(err)));
  }, [project, folder, refreshKey]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const confirmDelete = (entry: Entry) =>
    popUp.open({
      title: `Delete "${displayName(entry.name)}"?`,
      desc: "This file will be permanently removed from the project.",
      onConfirm: () =>
        invoke("delete_document", { project, name: entry.path })
          .then(() => onDeleted?.(entry.path))
          .catch((err) => alert(`Couldn't delete ${entry.name}: ${err}`)),
    });

  if (error) return folder ? null : <p className={styles.empty}>Couldn't read the documents folder.</p>;
  if (!entries) return null;
  if (!entries.length) return <p className={styles.empty}>{folder ? "Empty folder" : "No documents yet."}</p>;

  return (
    <ul className={folder ? `${styles.tree} ${styles.nested}` : styles.tree}>
      {entries.map((entry) => (
        <li key={entry.path}>
          {entry.is_dir ? (
            <>
              <button
                title={entry.name}
                onClick={() => toggle(entry.path)}
                onContextMenu={(e) =>
                  createContext(e, [
                    { name: expanded.has(entry.path) ? "Collapse" : "Expand", function: () => toggle(entry.path) },
                  ])
                }
              >
                {expanded.has(entry.path) ? <FaChevronDown className={styles.chevron} /> : <FaChevronRight className={styles.chevron} />}
                <FaRegFolder />
                <span>{entry.name}</span>
              </button>
              {expanded.has(entry.path) && (
                <FileTree project={project} folder={entry.path} refreshKey={refreshKey} onOpenFile={onOpenFile} onDeleted={onDeleted} />
              )}
            </>
          ) : (
            <button
              title={fileTitle(entry.name)}
              onClick={() => onOpenFile(entry.path)}
                onContextMenu={(e) => createContext(e, [{ name: "Open", function: () => onOpenFile(entry.path), icon: <FaFileWord /> }, {
                name: "Delete", function: () => confirmDelete(entry), icon: <FaTrash />, danger: true
              }])}
            >
              <span className={styles.chevron} />
              <FileIcon name={entry.name} />
              <span>{displayName(entry.name)}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
};

export default FileTree;
