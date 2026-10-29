// Bundles Monaco with the app instead of letting @monaco-editor/react fetch
// it from a CDN, so the code tabs work offline inside Tauri.
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "html") return new HtmlWorker();
    if (label === "json") return new JsonWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });
