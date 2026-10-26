import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ContextMenuButton } from "../contexts/ContextMenuContext";
import styles from "./ContextMenu.module.css";

type Props = {
  x: number;
  y: number;
  buttons: ContextMenuButton[];
  onClose: () => void;
};

const EDGE = 8;

const ContextMenu = ({ x, y, buttons, onClose }: Props) => {
  const ref = useRef<HTMLMenuElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Measure before paint and flip back inside the window near the edges.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const left = x + width + EDGE > window.innerWidth ? Math.max(EDGE, x - width) : x;
    const top = y + height + EDGE > window.innerHeight ? Math.max(EDGE, y - height) : y;
    setPos({ left, top });
  }, [x, y, buttons]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <menu
      ref={ref}
      role="menu"
      className={styles.menu}
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      {buttons.map((button) => (
        <li key={button.name}>
          <button
            role="menuitem"
            disabled={button.disabled}
            className={button.danger ? styles.danger : undefined}
            onClick={() => {
              onClose();
              button.function();
            }}
          >
            <span>{button.name}</span>
            {button.icon && <span className={styles.icon}>{button.icon}</span>}
          </button>
        </li>
      ))}
    </menu>
  );
};

export default ContextMenu;
