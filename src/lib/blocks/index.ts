// The Text Blocks system: .blocks files of text, templates and datasets, the
// editor for them, and the picker that inserts them into a resume.
//
// - types.ts       file format, constructors, loading older files
// - templates.ts   {{variables}}, filling a template from a dataset row
// - insertText.ts  plain text -> resume content, styled like its surroundings
// - pastedText.ts  rich-text pastes -> the plain-text shape blocks use
// - BlocksEditor   editing a .blocks file
// - BlocksPicker   the sidebar list that inserts blocks into the resume

export * from "./types";
export * from "./templates";
export { insertAsNewLine, insertAtCursor } from "./insertText";
export { htmlToBlockText, tidyPlainText } from "./pastedText";
export { default as BlocksEditor } from "./BlocksEditor";
export { default as BlocksPicker } from "./BlocksPicker";
