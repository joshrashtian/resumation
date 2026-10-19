// .blocks files: what the Text Blocks editor saves.
export const BLOCKS_EXTENSION = ".blocks";

// A .blocks file holds three kinds of block:
// - text: plain text to drop into a resume.
// - template: text with {{variables}}, filled in from the rows of its datasets.
// - data (a dataset): rows of values for one template, keyed by its variables.
// A template can have many datasets; each dataset belongs to one template.
export type TextBlock = { id: string; type: "text-block"; text: string };

// How a variable's value is entered and written into the resume.
export type VariableKind = "text" | "year" | "month";

export type TemplateBlock = {
  id: string;
  type: "template";
  name: string;
  text: string;
  variables: Record<string, VariableKind>;
};

export type DataRow = { id: string; values: Record<string, string> };
export type DatasetBlock = {
  id: string;
  type: "data";
  key: string;
  rows: DataRow[];
  // Id of the template block in the same file whose variables it fills.
  template?: string;
};

export type Block = TextBlock | TemplateBlock | DatasetBlock;
export type BlocksFile = { blocks: Block[] };

export const isBlocksFile = (name: string) => name.toLowerCase().endsWith(BLOCKS_EXTENSION);

export const newTextBlock = (text = ""): TextBlock => ({ id: crypto.randomUUID(), text, type: "text-block" });
export const newTemplate = (): TemplateBlock => ({ id: crypto.randomUUID(), type: "template", name: "", text: "", variables: {} });
export const newDataset = (template?: string): DatasetBlock => ({
  id: crypto.randomUUID(),
  type: "data",
  key: "",
  rows: [],
  template,
});
export const newRow = (): DataRow => ({ id: crypto.randomUUID(), values: {} });

// Fills in what older files may lack: blocks saved before types existed are
// text, and templates once pointed at a single dataset instead of datasets
// pointing at their template.
export function normalizeBlocks(blocks: unknown[] | undefined): Block[] {
  const raws = (blocks ?? []) as (Partial<Block> & { id: string; dataset?: string })[];
  const oldLinks = new Map(raws.filter((b) => b.type === "template" && b.dataset).map((b) => [b.dataset!, b.id]));
  return raws.map((block) => {
    if (block.type === "template") {
      const { dataset: _, ...rest } = block;
      return { ...newTemplate(), ...rest, variables: block.variables ?? {} } as TemplateBlock;
    }
    if (block.type === "data") {
      const template = (block as Partial<DatasetBlock>).template ?? oldLinks.get(block.id);
      return { ...newDataset(), ...block, rows: block.rows ?? [], template } as DatasetBlock;
    }
    return { ...newTextBlock(), ...block, type: "text-block" } as TextBlock;
  });
}
