// Page size and margins in inches, plus the document's base font, used to lay
// the editor out like the printed page.
export type PageLayout = {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  fontFamily?: string;
  fontSize?: string;
};

// US Letter with Word's default 1-inch margins, for resumes started in the app.
export const DEFAULT_LAYOUT: PageLayout = {
  width: 8.5,
  height: 11,
  marginTop: 1,
  marginRight: 1,
  marginBottom: 1,
  marginLeft: 1,
};
