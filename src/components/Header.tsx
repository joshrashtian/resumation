import { getCurrentWindow } from "@tauri-apps/api/window";
import { FaGear, FaPencil, FaUpload } from "react-icons/fa6";
import { LuMinus, LuPanelLeft, LuPanelRight, LuSquare, LuX } from "react-icons/lu";
import "./header.css";

type HeaderProps = {
  fileName?: string;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onUpload: () => void;
  onSettings: () => void;
};

const isWindows = navigator.userAgent.includes("Windows");

// Custom title bar for the frameless window. Empty areas and text carry
// data-tauri-drag-region so the window can be dragged from them; buttons don't.
const Header = ({ fileName, leftOpen, rightOpen, onToggleLeft, onToggleRight, onUpload, onSettings }: HeaderProps) => {
  const win = getCurrentWindow();

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-group" data-tauri-drag-region>
        <button
          title={`${leftOpen ? "Hide" : "Show"} documents (⌘[)`}
          className="titlebar-button"
          aria-pressed={leftOpen}
          onClick={onToggleLeft}
        >
          <LuPanelLeft />
        </button>
        <button title="Open Word document" className="titlebar-button" onClick={onUpload}>
          <FaUpload />
        </button>
      </div>

      <div className="titlebar-title" data-tauri-drag-region>
        <FaPencil />
        <span className="titlebar-app">Resumation</span>
        <span className="titlebar-sep">/</span>
        <span className={`titlebar-file${fileName ? "" : " untitled"}`}>{fileName ?? "Untitled"}</span>
      </div>

      <div className="titlebar-group" data-tauri-drag-region>
        <button
          title={`${rightOpen ? "Hide" : "Show"} details (⌘])`}
          className="titlebar-button"
          aria-pressed={rightOpen}
          onClick={onToggleRight}
        >
          <LuPanelRight />
        </button>
        <button title="Settings" className="titlebar-button" onClick={onSettings}>
          <FaGear />
        </button>
        {isWindows && (
          <div className="window-controls">
            <button title="Minimize" onClick={() => win.minimize()}>
              <LuMinus />
            </button>
            <button title="Maximize" onClick={() => win.toggleMaximize()}>
              <LuSquare />
            </button>
            <button title="Close" className="close" onClick={() => win.close()}>
              <LuX />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
