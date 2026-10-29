import { Extension } from "@tiptap/react";

export type PageLimitStorage = {
  // Maximum content height in pixels; null means no limit.
  maxHeight: number | null;
  // Called when an edit is rejected for going over the limit.
  onBlocked?: () => void;
};

declare module "@tiptap/core" {
  interface Storage {
    pageLimit: PageLimitStorage;
  }
}

// Height of the rendered content, ignoring the editor's padding and min-height.
// The editor element must be position: relative so offsetTop is measured from it.
export function contentHeight(dom: HTMLElement): number {
  const last = dom.lastElementChild as HTMLElement | null;
  if (!last) return 0;
  const style = getComputedStyle(dom);
  return last.offsetTop + last.offsetHeight + parseFloat(getComputedStyle(last).marginBottom) - parseFloat(style.paddingTop);
}

// Rejects edits that would make the document taller than the page limit.
// Each edit is trial-rendered and measured, then either applied or dropped,
// so typing, pasting and formatting changes are all covered. Edits that don't
// grow the document (deleting, or editing an already-too-long import) are allowed.
export const PageLimit = Extension.create<object, PageLimitStorage>({
  name: "pageLimit",

  addStorage() {
    return { maxHeight: null };
  },

  dispatchTransaction({ transaction, next }) {
    const { maxHeight, onBlocked } = this.storage;
    const view = this.editor.view;
    if (!maxHeight || !transaction.docChanged || !view.dom.isConnected) {
      next(transaction);
      return;
    }

    const before = view.state;
    const heightBefore = contentHeight(view.dom);
    view.updateState(before.apply(transaction));
    const heightAfter = contentHeight(view.dom);
    view.updateState(before);

    if (heightAfter > maxHeight + 1 && heightAfter > heightBefore) {
      onBlocked?.();
      return;
    }
    next(transaction);
  },
});
