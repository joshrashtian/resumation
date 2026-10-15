import type { PageStatus } from "./Editor";
import "./Footer.css";

type EditorFooterProps = {
  pageLimit: number;
  status: PageStatus;
};

const EditorFooter = ({ pageLimit, status }: EditorFooterProps) => {
  const pages = `${pageLimit} page${pageLimit === 1 ? "" : "s"}`;
  const over = status.limitHit || status.usage > 1;

  let message = "No page limit";
  if (pageLimit > 0) {
    if (status.limitHit) message = `Page limit reached: the resume can't go past ${pages}.`;
    else if (status.usage > 1) message = `Over the ${pages} limit. Trim content to fit.`;
    else message = `${Math.round(status.usage * 100)}% of ${pages} used`;
  }

  return <footer className={pageLimit > 0 && over ? "over editor-footer" : "editor-footer"}>{message}</footer>;
};

export default EditorFooter;
