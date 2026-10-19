import { getCurrentWindow } from "@tauri-apps/api/window";
import { FaFloppyDisk, FaGear, FaPencil, FaUpload } from "react-icons/fa6";
import { LuHouse, LuMinus, LuPanelLeft, LuPanelRight, LuSquare, LuX } from "react-icons/lu";
import styles from "./Header.module.css";

type HeaderProps = {
  projectName: string;
  fileName?: string;
  onHome: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onUpload: () => void;
  onSave: () => void;
  onSettings: () => void;
};

const isWindows = navigator.userAgent.includes("Windows");

const Header = ({ projectName, fileName, onHome, leftOpen, rightOpen, onToggleLeft, onToggleRight, onUpload, onSave, onSettings }: HeaderProps) => {
  const win = getCurrentWindow();

  return (
    <header className={styles.titlebar} data-tauri-drag-region>
      <div className={styles.group} data-tauri-drag-region>
        <button
          title={`${leftOpen ? "Hide" : "Show"} documents (⌘[)`}
          className={styles.button}
          aria-pressed={leftOpen}
          onClick={onToggleLeft}
        >
          <LuPanelLeft />
        </button>
        <button title="All projects" className={styles.button} onClick={onHome}>
          <LuHouse />
        </button>
        <button title="Add Word document to project" className={styles.button} onClick={onUpload}>
          <FaUpload />
        </button>
        <button title="Save (⌘S)" className={styles.button} onClick={onSave}>
          <FaFloppyDisk />
        </button>
      </div>

      <div className={styles.title} data-tauri-drag-region>
        <FaPencil />
        <span className={styles.app}>Resumation</span>
        <span className={styles.sep}>/</span>
        <span className={styles.file}>{projectName}</span>
        <span className={styles.sep}>/</span>
        <span className={fileName ? styles.file : `${styles.file} ${styles.untitled}`}>{fileName ?? "Untitled"}</span>
      </div>

      <div className={styles.group} data-tauri-drag-region>
        <button
          title={`${rightOpen ? "Hide" : "Show"} details (⌘])`}
          className={styles.button}
          aria-pressed={rightOpen}
          onClick={onToggleRight}
        >
          <LuPanelRight />
        </button>
        <button title="Settings" className={styles.button} onClick={onSettings}>
          <FaGear />
        </button>
        {isWindows && (
          <div className={styles.windowControls}>
            <button title="Minimize" onClick={() => win.minimize()}>
              <LuMinus />
            </button>
            <button title="Maximize" onClick={() => win.toggleMaximize()}>
              <LuSquare />
            </button>
            <button title="Close" className={styles.close} onClick={() => win.close()}>
              <LuX />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
