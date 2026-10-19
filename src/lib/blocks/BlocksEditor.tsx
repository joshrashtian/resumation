import { useEffect, useLayoutEffect, useRef } from "react";
import { LuArrowDown, LuArrowUp, LuBraces, LuCopy, LuPlus, LuTable, LuTrash2 } from "react-icons/lu";
import {
  Block,
  DatasetBlock,
  newDataset,
  newRow,
  newTemplate,
  newTextBlock,
  TemplateBlock,
  VariableKind,
} from "./types";
import { htmlToBlockText, tidyPlainText } from "./pastedText";
import { Column, datasetColumns, datasetsOf, isTemplate, syncVariables } from "./templates";
import styles from "./BlocksEditor.module.css";

type BlocksEditorProps = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
};

type Focusable = HTMLTextAreaElement | HTMLInputElement;

// Grows with its text so every block shows in full.
function AutoText({ value, onChange, onKeyDown, textareaRef, placeholder = "Type something…", className = styles.text }: {
  value: string;
  onChange: (text: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const local = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = local.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(el) => {
        local.current = el;
        textareaRef?.(el);
      }}
      className={className}
      value={value}
      rows={1}
      placeholder={placeholder}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        const html = e.clipboardData.getData("text/html");
        const plain = e.clipboardData.getData("text/plain");
        const text = html ? htmlToBlockText(html) : tidyPlainText(plain);
        if (!text || text === plain) return;
        e.preventDefault();
        // Replace the selection by hand, then put the caret after the paste.
        const el = e.currentTarget;
        const { selectionStart: start, selectionEnd: end } = el;
        onChange(value.slice(0, start) + text + value.slice(end));
        requestAnimationFrame(() => el.setSelectionRange(start + text.length, start + text.length));
      }}
    />
  );
}

const KINDS: { value: VariableKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "year", label: "Year" },
  { value: "month", label: "Month" },
];

// Text with {{variables}}, filled in by the datasets that belong to it.
function TemplateEditor({ block, datasets, onChange, onNewDataset, onKeyDown, nameRef }: {
  block: TemplateBlock;
  // The datasets that belong to this template.
  datasets: DatasetBlock[];
  onChange: (block: TemplateBlock) => void;
  onNewDataset: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  nameRef: (el: HTMLInputElement | null) => void;
}) {
  const variables = Object.entries(block.variables);

  // Tab types a tab, which pushes what follows to the right edge in the resume.
  const keyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = el;
      const text = block.text.slice(0, start) + "\t" + block.text.slice(end);
      onChange({ ...block, text, variables: syncVariables(text, block.variables) });
      requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
      return;
    }
    onKeyDown(e);
  };

  return (
    <>
      <div className={styles.heading}>
        <LuBraces className={styles.kindIcon} title="Template" />
        <input
          ref={nameRef}
          className={styles.name}
          value={block.name}
          placeholder="Template name, e.g. Programming Projects"
          onChange={(e) => onChange({ ...block, name: e.target.value })}
        />
      </div>
      <AutoText
        className={`${styles.text} ${styles.templateText}`}
        value={block.text}
        placeholder={"{{title}}\t{{year}}\n- {{desc}}"}
        onChange={(text) => onChange({ ...block, text, variables: syncVariables(text, block.variables) })}
        onKeyDown={keyDown}
      />
      <div className={styles.footer}>
        {variables.length ? (
          <ul className={styles.variables} aria-label="Variables">
            {variables.map(([name, kind]) => (
              <li key={name}>
                <code>{name}</code>
                <select
                  value={kind}
                  aria-label={`Kind of ${name}`}
                  onChange={(e) =>
                    onChange({ ...block, variables: { ...block.variables, [name]: e.target.value as VariableKind } })
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>
            Type <code>{"{{name}}"}</code> to add a variable. Tab pushes what follows to the right.
          </p>
        )}
        <div className={styles.link}>
          <span>{datasets.length === 1 ? "1 dataset" : `${datasets.length} datasets`}</span>
          <button className={styles.addRow} onClick={onNewDataset}>
            <LuPlus /> New dataset
          </button>
        </div>
      </div>
    </>
  );
}

// Plain one-line inputs for years and months; text grows.
function Field({ column, value, onChange }: { column: Column; value: string; onChange: (value: string) => void }) {
  if (column.kind === "month") {
    return <input type="month" className={styles.field} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (column.kind === "year") {
    return (
      <input
        className={styles.field}
        inputMode="numeric"
        maxLength={4}
        placeholder="2024"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    );
  }
  return <AutoText className={styles.field} value={value} placeholder="" onChange={onChange} />;
}

// Rows of values for one template. Its columns come from that template's variables.
function DatasetEditor({ block, templates, columns, onChange, nameRef }: {
  block: DatasetBlock;
  templates: TemplateBlock[];
  columns: Column[];
  onChange: (block: DatasetBlock) => void;
  nameRef: (el: HTMLInputElement | null) => void;
}) {
  const setRows = (rows: DatasetBlock["rows"]) => onChange({ ...block, rows });
  const linked = templates.some((t) => t.id === block.template) ? block.template! : "";

  const setValue = (rowId: string, name: string, value: string) =>
    setRows(
      block.rows.map((row) => {
        if (row.id !== rowId) return row;
        // Cleared values are dropped, so a column no template uses goes away once it's empty.
        const { [name]: _, ...rest } = row.values;
        return { ...row, values: value ? { ...rest, [name]: value } : rest };
      }),
    );

  const moveRow = (index: number, by: -1 | 1) => {
    const to = index + by;
    const rows = [...block.rows];
    [rows[index], rows[to]] = [rows[to], rows[index]];
    setRows(rows);
  };

  return (
    <>
      <div className={styles.heading}>
        <LuTable className={styles.kindIcon} title="Dataset" />
        <input
          ref={nameRef}
          className={styles.name}
          value={block.key}
          placeholder="Dataset name, e.g. Projects"
          onChange={(e) => onChange({ ...block, key: e.target.value })}
        />
      </div>
      <label className={`${styles.link} ${styles.templateLink}`}>
        Template
        <select value={linked} onChange={(e) => onChange({ ...block, template: e.target.value || undefined })}>
          <option value="">No template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name || "Untitled template"}
            </option>
          ))}
        </select>
      </label>
      {columns.length === 0 && <p className={styles.hint}>Choose a template to give this dataset its columns.</p>}
      {block.rows.length > 0 && columns.length > 0 && (
        <ol className={styles.rows}>
          {block.rows.map((row, index) => (
            <li key={row.id} className={styles.row}>
              {columns.map((column) => (
                <label key={column.name} className={styles.cell}>
                  <span>{column.name}</span>
                  <Field
                    column={column}
                    value={row.values[column.name] ?? ""}
                    onChange={(value) => setValue(row.id, column.name, value)}
                  />
                </label>
              ))}
              <div className={styles.rowActions}>
                <button title="Move row up" onClick={() => moveRow(index, -1)} disabled={index === 0}>
                  <LuArrowUp />
                </button>
                <button title="Move row down" onClick={() => moveRow(index, 1)} disabled={index === block.rows.length - 1}>
                  <LuArrowDown />
                </button>
                <button title="Delete row" onClick={() => setRows(block.rows.filter((r) => r.id !== row.id))}>
                  <LuTrash2 />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className={styles.footer}>
        <button className={styles.addRow} disabled={!columns.length} onClick={() => setRows([...block.rows, newRow()])}>
          <LuPlus /> Add row
        </button>
      </div>
    </>
  );
}

// A stack of blocks: plain text, templates and datasets. ⌘↵ adds a text block
// below; ⌫ in an empty text block removes it.
const BlocksEditor = ({ blocks, onChange }: BlocksEditorProps) => {
  const inputs = useRef(new Map<string, Focusable>());
  // A fresh file starts with the cursor in its empty block.
  const focusNext = useRef<string | null>(
    blocks.length === 1 && blocks[0].type === "text-block" && !blocks[0].text ? blocks[0].id : null,
  );

  useEffect(() => {
    if (!focusNext.current) return;
    inputs.current.get(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const templates = blocks.filter(isTemplate);

  const replace = (block: Block) => onChange(blocks.map((b) => (b.id === block.id ? block : b)));

  const insertAfter = (index: number, block: Block = newTextBlock()) => {
    focusNext.current = block.id;
    onChange([...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)]);
  };

  // A new dataset goes below the template's last dataset (or the template itself), already linked.
  const newDatasetFor = (index: number, template: TemplateBlock) => {
    const last = blocks.reduce((at, b, i) => (b.type === "data" && b.template === template.id ? i : at), index);
    insertAfter(Math.max(index, last), newDataset(template.id));
  };

  const remove = (index: number) => {
    const next = blocks.filter((_, i) => i !== index);
    focusNext.current = next[Math.max(0, index - 1)]?.id ?? null;
    onChange(next);
  };

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  const onKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const block = blocks[index];
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      insertAfter(index);
    } else if (e.key === "Backspace" && block.type === "text-block" && block.text === "" && blocks.length > 1) {
      e.preventDefault();
      remove(index);
    }
  };

  const register = (id: string) => (el: Focusable | null) => {
    if (el) inputs.current.set(id, el);
    else inputs.current.delete(id);
  };

  const copyable = (block: Block) => (block.type === "data" ? null : block.text);

  return (
    <div className={styles.blocks}>
      {blocks.map((block, index) => (
        <div key={block.id} className={`${styles.block} ${block.type === "text-block" ? "" : styles.structured}`}>
          {block.type === "text-block" && (
            <AutoText
              value={block.text}
              onChange={(text) => replace({ ...block, text })}
              onKeyDown={onKeyDown(index)}
              textareaRef={register(block.id)}
            />
          )}
          {block.type === "template" && (
            <TemplateEditor
              block={block}
              datasets={datasetsOf(block, blocks)}
              onChange={replace}
              onNewDataset={() => newDatasetFor(index, block)}
              onKeyDown={onKeyDown(index)}
              nameRef={register(block.id)}
            />
          )}
          {block.type === "data" && (
            <DatasetEditor
              block={block}
              templates={templates}
              columns={datasetColumns(block, blocks)}
              onChange={replace}
              nameRef={register(block.id)}
            />
          )}
          <div className={styles.actions}>
            {copyable(block) !== null && (
              <button title="Copy text" onClick={() => navigator.clipboard.writeText(copyable(block)!)} disabled={!copyable(block)}>
                <LuCopy />
              </button>
            )}
            <button title="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
              <LuArrowUp />
            </button>
            <button title="Move down" onClick={() => move(index, 1)} disabled={index === blocks.length - 1}>
              <LuArrowDown />
            </button>
            <button title="Delete block" onClick={() => remove(index)}>
              <LuTrash2 />
            </button>
          </div>
        </div>
      ))}
      <div className={styles.addBar}>
        <button onClick={() => insertAfter(blocks.length - 1)}>
          <LuPlus /> Text
        </button>
        <button onClick={() => insertAfter(blocks.length - 1, newTemplate())}>
          <LuBraces /> Template
        </button>
        <button onClick={() => insertAfter(blocks.length - 1, newDataset(templates.length === 1 ? templates[0].id : undefined))}>
          <LuTable /> Dataset
        </button>
      </div>
    </div>
  );
};

export default BlocksEditor;
