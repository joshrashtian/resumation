import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/react";
import { LuBraces, LuChevronDown, LuChevronRight, LuCornerDownLeft } from "react-icons/lu";
import { displayName } from "../fileTypes";
import type { Entry } from "../../components/files/FileTree";
import { Block, BlocksFile, DataRow, isBlocksFile, normalizeBlocks, TemplateBlock, TextBlock } from "./types";
import { insertAsNewLine, insertAtCursor } from "./insertText";
import { datasetColumns, datasetsOf, fillTemplate, isTemplate, rowLabel } from "./templates";
import styles from "./BlocksPicker.module.css";

type BlocksPickerProps = {
  project: string;
  // Bumped whenever files may have changed on disk.
  refreshKey: number;
  // The resume editor to insert into; null while it isn't showing.
  editor: Editor | null;
};

// Every Text Blocks file in the project, including subfolders.
async function findBlocksFiles(project: string, folder?: string): Promise<string[]> {
  const entries = await invoke<Entry[]>("list_documents", { project, folder });
  const nested = await Promise.all(entries.filter((e) => e.is_dir).map((e) => findBlocksFiles(project, e.path)));
  return [...entries.filter((e) => !e.is_dir && isBlocksFile(e.name)).map((e) => e.path), ...nested.flat()];
}

// Text blocks with text go in as they are; templates go in filled from their dataset.
const hasText = (block: Block): block is TextBlock => block.type === "text-block" && !!block.text.trim();

const storageKey = (project: string) => `resumation.blocksPicker.${project}`;

// Lists the blocks of one Text Blocks file; clicking a block puts it in the resume.
const BlocksPicker = ({ project, refreshKey, editor }: BlocksPickerProps) => {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey(project)) ?? "";
    } catch {
      return "";
    }
  });
  const [blocks, setBlocks] = useState<Block[]>([]);

  useEffect(() => {
    findBlocksFiles(project)
      .then(setFiles)
      .catch((err) => console.error(err));
  }, [project, refreshKey]);

  // Fall back to the first file when the remembered one is gone.
  const current = files.includes(selected) ? selected : (files[0] ?? "");

  useEffect(() => {
    if (!current) return setBlocks([]);
    invoke<string>("read_document", { project, name: current })
      .then((json) => setBlocks(normalizeBlocks((JSON.parse(json) as BlocksFile).blocks)))
      .catch((err) => {
        console.error(err);
        setBlocks([]);
      });
  }, [project, current, refreshKey]);

  function choose(path: string) {
    setSelected(path);
    try {
      localStorage.setItem(storageKey(project), path);
    } catch {}
  }

  const texts = blocks.filter(hasText);
  const templates = blocks.filter(isTemplate).filter((t) => t.text.trim());

  if (!files.length) {
    return <p className={styles.empty}>No Text Blocks yet. Create one with + in Documents.</p>;
  }

  return (
    <div className={styles.picker}>
      <select value={current} onChange={(e) => choose(e.target.value)} aria-label="Text Blocks file">
        {files.map((path) => (
          <option key={path} value={path}>
            {displayName(path)}
          </option>
        ))}
      </select>
      {!editor && <p className={styles.empty}>Open a resume to insert blocks.</p>}
      {texts.length === 0 && templates.length === 0 && <p className={styles.empty}>This file has no text yet.</p>}
      {templates.length > 0 && (
        <ul className={styles.blocks}>
          {templates.map((template) => (
            <TemplateItem key={template.id} template={template} blocks={blocks} editor={editor} />
          ))}
        </ul>
      )}
      <ul className={styles.blocks}>
        {texts.map((block) => (
          <li key={block.id}>
            <button
              className={styles.block}
              title="Insert at cursor"
              disabled={!editor}
              onClick={() => editor && insertAtCursor(editor, block.text)}
            >
              {block.text}
            </button>
            <button
              className={styles.newLine}
              title="Insert as new line or bullet"
              disabled={!editor}
              onClick={() => editor && insertAsNewLine(editor, block.text)}
            >
              <LuCornerDownLeft />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// A template and the rows of all its datasets; the ticked rows go in, in order.
function TemplateItem({ template, blocks, editor }: { template: TemplateBlock; blocks: Block[]; editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  // Rows left unticked; everything else is in, including rows added later.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const datasets = datasetsOf(template, blocks);
  const rows = datasets.flatMap((d) => d.rows);
  const chosen = rows.filter((row) => !skipped.has(row.id));
  const text = chosen.map((row) => fillTemplate(template, row)).join("\n");

  const toggle = (id: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const checkbox = (row: DataRow, label: string) => (
    <li key={row.id}>
      <label>
        <input type="checkbox" checked={!skipped.has(row.id)} onChange={() => toggle(row.id)} />
        <span>{label}</span>
      </label>
    </li>
  );

  return (
    <li className={styles.template}>
      <button className={styles.templateName} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <LuChevronDown /> : <LuChevronRight />}
        <LuBraces className={styles.templateIcon} />
        <span>{template.name || "Untitled template"}</span>
        {datasets.length > 0 && <span className={styles.count}>{chosen.length}/{rows.length}</span>}
      </button>
      {open && (
        <div className={styles.templateBody}>
          {!datasets.length && <p className={styles.empty}>Add a dataset to this template in its Text Blocks file.</p>}
          {datasets.length > 0 && !rows.length && <p className={styles.empty}>Its datasets have no rows yet.</p>}
          {rows.length > 0 && (
            <ul className={styles.rows}>
              {datasets.map((dataset) => {
                if (!dataset.rows.length) return null;
                const columns = datasetColumns(dataset, blocks);
                // A one-row dataset is one entry, so it goes by the dataset's name.
                if (dataset.rows.length === 1) {
                  return checkbox(dataset.rows[0], dataset.key || rowLabel(dataset.rows[0], columns));
                }
                return (
                  <li key={dataset.id}>
                    <span className={styles.group}>{dataset.key || "Untitled dataset"}</span>
                    <ul className={styles.rows}>{dataset.rows.map((row) => checkbox(row, rowLabel(row, columns)))}</ul>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length > 0 && (
            <div className={styles.templateActions}>
              <button
                title="Insert at cursor"
                disabled={!editor || !chosen.length}
                onClick={() => editor && insertAtCursor(editor, text)}
              >
                Insert {chosen.length === 1 ? "1 row" : `${chosen.length} rows`}
              </button>
              <button
                className={styles.iconButton}
                title="Insert as new line or bullet"
                disabled={!editor || !chosen.length}
                onClick={() => editor && insertAsNewLine(editor, text)}
              >
                <LuCornerDownLeft />
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default BlocksPicker;
