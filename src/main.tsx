import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/fonts";

if (navigator.userAgent.includes("Mac")) {
  document.documentElement.dataset.platform = "mac";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
