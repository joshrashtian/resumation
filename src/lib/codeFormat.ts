// Pretty-prints the editor's HTML for the Code tab with Prettier. Prettier is
// loaded on first use so it stays out of the main bundle.
export async function formatHtml(html: string): Promise<string> {
  const [{ format }, htmlPlugin] = await Promise.all([import("prettier/standalone"), import("prettier/plugins/html")]);
  const formatted = await format(html, {
    parser: "html",
    plugins: [htmlPlugin],
    // Wide lines so long tags (links, styled spans) rarely need breaking.
    printWidth: 120,
  });
  return formatted.trimEnd();
}
