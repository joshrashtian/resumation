import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FaChevronDown, FaChevronRight, FaFileWord, FaRegFileLines, FaRegFolder } from "react-icons/fa6";

export type Entry = {
  name: string;
  path: string;
  is_dir: boolean;
};

type FolderProps = {

  folder?: string;

  refreshKey: number;
  onOpenFile: (path: string) => void;
};

const FileTree = ({ folder, refreshKey, onOpenFile }: FolderProps) => {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    invoke<Entry[]>("list_documents", { folder })
      .then((list) => {
        setEntries(list);
        setError(null);
      })
      .catch((err) => setError(String(err)));
  }, [folder, refreshKey]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  if (error) return folder ? null : <p className="empty">Couldn't read the documents folder.</p>;
  if (!entries) return null;
  if (!entries.length) return <p className="empty">{folder ? "Empty folder" : "No documents yet."}</p>;

  return (
    <ul className={folder ? "file-tree nested" : "file-tree"}>
      {entries.map((entry) => (
        <li key={entry.path}>
          {entry.is_dir ? (
            <>
              <button title={entry.name} onClick={() => toggle(entry.path)}>
                {expanded.has(entry.path) ? <FaChevronDown className="chevron" /> : <FaChevronRight className="chevron" />}
                <FaRegFolder />
                <span>{entry.name}</span>
              </button>
              {expanded.has(entry.path) && (
                <FileTree folder={entry.path} refreshKey={refreshKey} onOpenFile={onOpenFile} />
              )}
            </>
          ) : (
            <button title={entry.name} onClick={() => onOpenFile(entry.path)}>
              <span className="chevron" />

                {entry.name.includes(".docx") ? <FaFileWord /> :     <FaRegFileLines />}
              <span>{entry.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
};

export default FileTree;
