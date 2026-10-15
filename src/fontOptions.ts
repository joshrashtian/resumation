// Common resume fonts. Each value is a CSS stack so text still looks right
// on machines missing the first choice. Carlito and Caladea (bundled in
// fonts.ts) are metric-compatible stand-ins for Calibri and Cambria.
export const FONTS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", value: "Calibri, Carlito, 'Segoe UI', sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Gill Sans", value: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
  { label: "Lato", value: "Lato, 'Helvetica Neue', Arial, sans-serif" },
  { label: "Roboto", value: "Roboto, 'Helvetica Neue', Arial, sans-serif" },
  { label: "Open Sans", value: "'Open Sans', 'Helvetica Neue', Arial, sans-serif" },
  { label: "Source Sans 3", value: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif" },
  { label: "Montserrat", value: "Montserrat, 'Helvetica Neue', Arial, sans-serif" },
  { label: "DM Sans", value: "'DM Sans', 'Helvetica Neue', Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Garamond", value: "'EB Garamond', Garamond, 'Times New Roman', serif" },
  { label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { label: "Cambria", value: "Cambria, Caladea, Georgia, serif" },
  { label: "Book Antiqua", value: "'Book Antiqua', Palatino, 'Palatino Linotype', serif" },
  { label: "Palatino", value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { label: "Didot", value: "Didot, 'Bodoni MT', 'Times New Roman', serif" },
  { label: "Londrina Sketch", value: "'Londrina Sketch', cursive" },
];

// Turns a font name (e.g. from a Word file) into the CSS stack the editor uses,
// so the font dropdown recognises it. Unknown fonts get a generic fallback.
export function fontStackFor(name: string, generic = "sans-serif"): string {
  const known = FONTS.find((font) => font.label.toLowerCase() === name.toLowerCase());
  if (known) return known.value;
  if (/^aptos/i.test(name)) return `'${name}', Calibri, Carlito, sans-serif`;
  return `'${name.replace(/'/g, "")}', ${generic}`;
}
