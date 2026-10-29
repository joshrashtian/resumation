import { Mark } from "@tiptap/react";

// Text pushed to the right edge of the line, like text after a right-aligned
// tab stop in Word (e.g. the dates on resume entries).
export const RightTab = Mark.create({
  name: "rightTab",

  // Outermost mark, so a run of right-aligned text stays one element even when
  // parts of it are bold or styled differently.
  priority: 1001,

  parseHTML() {
    return [{ tag: "span[data-right-tab]" }];
  },

  renderHTML() {
    return ["span", { "data-right-tab": "", class: "right-tab" }, 0];
  },
});
