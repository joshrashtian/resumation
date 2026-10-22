import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import NewFileInput from "./NewFileInput";
import styles from "./VersionHistory.module.css";

// Mirror version_control::Version and History in src-tauri.
export type Version = {
  id: number;
  parent: number | null;
  hash: string;
  time: number; // unix millis
  message: string;
  variant: string;
};

export type History = {
  // The variant the file on disk belongs to.
  variant: string;
  // Each variant's current version.
  heads: Record<string, number>;
  versions: Version[];
};

export const EMPTY_HISTORY: History = { variant: "Main", heads: {}, versions: [] };

const timeFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function when(time: number) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return timeFormat.format(time);
}

type VersionHistoryProps = {
  // False while the open document hasn't been saved yet.
  saved: boolean;
  history: History;
  previewId: number | null;
  onSaveNamed: (message: string) => void;
  onPreview: (version: Version) => void;
  onCreateVariant: (name: string) => void;
  onSwitchVariant: (name: string) => void;
};

// The open file's variants and the current variant's versions, newest first;
// clicking a version previews it.
const VersionHistory = ({ saved, history, previewId, onSaveNamed, onPreview, onCreateVariant, onSwitchVariant }: VersionHistoryProps) => {
  const [naming, setNaming] = useState<"version" | "variant" | null>(null);

  if (!saved) return <p className={styles.empty}>Save this document to start its version history.</p>;

  const { variant, heads } = history;
  const variants = Object.keys(heads).includes(variant) ? Object.keys(heads) : [variant, ...Object.keys(heads)];
  const byId = new Map(history.versions.map((v) => [v.id, v]));
  const versions = history.versions.filter((v) => v.variant === variant).reverse();
  // Where a variant came from: the first version reached from its head that belongs to another variant.
  let origin: Version | undefined = byId.get(heads[variant]);
  while (origin && origin.variant === variant) origin = origin.parent === null ? undefined : byId.get(origin.parent);

  const label = (v: Version) => v.message || `Version ${v.id}`;

  return (
    <div className={styles.history}>
      <div className={styles.variants}>
        <select aria-label="Variant" value={variant} onChange={(e) => onSwitchVariant(e.target.value)}>
          {variants.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          className={styles.icon}
          title="New variant from the current document"
          aria-pressed={naming === "variant"}
          onClick={() => setNaming((n) => (n === "variant" ? null : "variant"))}
        >
          <LuPlus />
        </button>
      </div>

      {naming === "variant" && (
        <NewFileInput
          placeholder="Variant name, e.g. SWE"
          onSubmit={(name) => {
            setNaming(null);
            onCreateVariant(name);
          }}
          onCancel={() => setNaming(null)}
        />
      )}
      {naming === "version" ? (
        <NewFileInput
          placeholder="Version name"
          onSubmit={(message) => {
            setNaming(null);
            onSaveNamed(message);
          }}
          onCancel={() => setNaming(null)}
        />
      ) : (
        <button className={styles.save} onClick={() => setNaming("version")}>
          Save version…
        </button>
      )}

      {versions.length === 0 && !origin && <p className={styles.empty}>No versions yet. One is saved each time you save.</p>}
      <ol className={styles.list}>
        {versions.map((v) => {
          const parent = v.parent === null ? undefined : byId.get(v.parent);
          // A parent other than the version just before it means this one branched off an older version.
          const branched = parent && parent.variant === variant && parent.id !== v.id - 1;
          return (
            <li key={v.id}>
              <button
                className={styles.version}
                aria-pressed={previewId === v.id}
                onClick={() => onPreview(v)}
                title={`Preview version ${v.id}`}
              >
                <span className={styles.name}>
                  {label(v)}
                  {heads[variant] === v.id && <span className={styles.current}>Current</span>}
                </span>
                <span className={styles.meta}>
                  v{v.id} · {when(v.time)}
                  {branched && ` · from v${parent.id}`}
                </span>
              </button>
            </li>
          );
        })}
        {origin && (
          <li>
            <button
              className={`${styles.version} ${styles.origin}`}
              aria-pressed={previewId === origin.id}
              onClick={() => onPreview(origin)}
              title={`Preview version ${origin.id}`}
            >
              <span className={styles.name}>
                Started from {origin.variant}
                {heads[variant] === origin.id && <span className={styles.current}>Current</span>}
              </span>
              <span className={styles.meta}>
                {label(origin)} · v{origin.id} · {when(origin.time)}
              </span>
            </button>
          </li>
        )}
      </ol>
    </div>
  );
};

export default VersionHistory;
