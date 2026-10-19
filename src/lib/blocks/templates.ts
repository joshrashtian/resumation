import type { Block, DataRow, DatasetBlock, TemplateBlock, VariableKind } from "./types";

// Templates are text with {{variables}}. Each row of the template's datasets
// fills them in, and the filled text goes into the resume like any Text Block.

const VARIABLE = /\{\{\s*([\w-]+)\s*\}\}/g;

// Variable names in the order they first appear.
export function templateVariables(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(VARIABLE), (m) => m[1]))];
}

// quick autoguess on major keywords
function guessKind(name: string): VariableKind {
  if (/year/i.test(name)) return "year";
  if (/date|start|end|month|from|until/i.test(name)) return "month";
  return "text";
}

// Variables for the template's text, keeping the kinds already chosen.
export function syncVariables(text: string, previous: Record<string, VariableKind>): Record<string, VariableKind> {
  return Object.fromEntries(templateVariables(text).map((name) => [name, previous[name] ?? guessKind(name)]));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Month values are stored as "2024-03" (from <input type="month">) and written as "Mar 2024".
function formatValue(value: string, kind: VariableKind | undefined): string {
  const month = kind === "month" && /^(\d{4})-(\d{2})$/.exec(value);
  if (month) return `${MONTHS[Number(month[2]) - 1] ?? ""} ${month[1]}`.trim();
  return value.trim();
}

// One row's text. A line whose variables are all empty is left out, so a
// missing description doesn't leave a bare "- " behind.
export function fillTemplate(template: TemplateBlock, row: DataRow): string {
  return template.text
    .split(/\r?\n/)
    .filter((line) => {
      const names = templateVariables(line);
      return !names.length || names.some((name) => row.values[name]?.trim());
    })
    .map((line) =>
      line.replace(VARIABLE, (_, name: string) => formatValue(row.values[name] ?? "", template.variables[name])),
    )
    .join("\n");
}

export const isTemplate = (block: Block): block is TemplateBlock => block.type === "template";
export const isDataset = (block: Block): block is DatasetBlock => block.type === "data";

export type Column = { name: string; kind: VariableKind };

export const templateOf = (dataset: DatasetBlock, blocks: Block[]) =>
  blocks.filter(isTemplate).find((t) => t.id === dataset.template);

export const datasetsOf = (template: TemplateBlock, blocks: Block[]) =>
  blocks.filter(isDataset).filter((d) => d.template === template.id);

// A dataset's columns: its template's variables, then any values its rows
// still hold for variables the template no longer uses.
export function datasetColumns(dataset: DatasetBlock, blocks: Block[]): Column[] {
  const columns = new Map(Object.entries(templateOf(dataset, blocks)?.variables ?? {}));
  for (const row of dataset.rows) {
    for (const name of Object.keys(row.values)) if (!columns.has(name)) columns.set(name, "text");
  }
  return [...columns].map(([name, kind]) => ({ name, kind }));
}

// What a row is called in lists: its first value.
export function rowLabel(row: DataRow, columns: Column[]): string {
  for (const { name, kind } of columns) {
    const value = row.values[name]?.trim();
    if (value) return formatValue(value, kind);
  }
  return "Empty row";
}
