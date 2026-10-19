import type { JSONContent } from "@tiptap/react";
import { PageLayout } from "./pageLayout";
import { BLOCKS_EXTENSION } from "./lib/blocks/types";

// Resumation's own file types are JSON inside, but have their own extension,
// which the UI hides and marks with an icon instead. Text Blocks (.blocks)
// live in lib/blocks with the rest of the block system.

// .resumation files: what the resume editor saves.
export const RESUMATION_EXTENSION = ".resumation";

export type ResumationFile = { name: string | null; layout: PageLayout; content: JSONContent };

export const isResumationFile = (name: string) => name.toLowerCase().endsWith(RESUMATION_EXTENSION);

// "Resume.resumation" -> "Resume", "Bullets.blocks" -> "Bullets"; other files keep their extension.
export function displayName(name: string) {
  for (const ext of [RESUMATION_EXTENSION, BLOCKS_EXTENSION]) {
    if (name.toLowerCase().endsWith(ext)) return name.slice(0, -ext.length);
  }
  return name;
}
