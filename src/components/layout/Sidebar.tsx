import type { ReactNode } from "react";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  side: "left" | "right";
  open: boolean;
  title: string;
  // Shown at the right of the title, e.g. a small icon button.
  action?: ReactNode;
  children: ReactNode;
};

const Sidebar = ({ side, open, title, action, children }: SidebarProps) => {
  return (
    <aside className={`${styles.sidebar} ${styles[side]}${open ? ` ${styles.open}` : ""}`} aria-hidden={!open} inert={!open}>
      <div className={styles.heading}>
        <h2>{title}</h2>
        {action && <div className={styles.action}>{action}</div>}
      </div>
      <div className={styles.body}>{children}</div>
    </aside>
  );
};

export default Sidebar;
