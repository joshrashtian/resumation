import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";

// App settings, shared between the main and settings windows. Both windows
// load the same origin, so localStorage is shared; a Tauri event tells the
// main window to pick up changes immediately.

export type Settings = {
  // Maximum resume length in pages; 0 means no limit.
  pageLimit: 0 | 1 | 2;
  // When false, the window gets a solid background instead of see-through glass.
  transparency: boolean;
};

const DEFAULTS: Settings = { pageLimit: 0, transparency: true };
const STORAGE_KEY = "resumation.settings";
const CHANGED_EVENT = "settings-changed";

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Couldn't save settings", err);
  }
  emit(CHANGED_EVENT).catch(() => {}); // not running inside Tauri (e.g. plain browser)
}

export function useSettings(): [Settings, (settings: Settings) => void] {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    const reload = () => setSettings(loadSettings());
    window.addEventListener("storage", reload);
    window.addEventListener("focus", reload);
    const unlisten = listen(CHANGED_EVENT, reload).catch(() => undefined);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("focus", reload);
      unlisten.then((stop) => stop?.());
    };
  }, []);

  const update = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  return [settings, update];
}
