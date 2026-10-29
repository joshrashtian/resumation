import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router";
import { useSettings } from "./lib/settings";
import HomePage from "./pages/HomePage";
import EditorPage from "./pages/EditorPage";
import SettingsPage from "./pages/SettingsPage";
import { ContextMenuProvider } from "./contexts/ContextMenuContext";
import PopUpText from "./contexts/PopUpContext";
import "./styles/global.css";

// Keyed by project so switching projects starts a fresh editor.
function EditorRoute() {
  const { project } = useParams();
  if (!project) return <Navigate to="/" replace />;
  return <EditorPage key={project} project={project} />;
}

// HashRouter because Tauri serves index.html from a custom protocol with no
// server-side fallback; the settings window opens at index.html#/settings.
function App() {
  const [settings] = useSettings();

  useEffect(() => {
    document.documentElement.dataset.transparency = settings.transparency ? "on" : "off";
  }, [settings.transparency]);

  return (
    <ContextMenuProvider>
      <PopUpText>
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/editor/:project" element={<EditorRoute />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </PopUpText>
    </ContextMenuProvider>
  );
}

export default App;
