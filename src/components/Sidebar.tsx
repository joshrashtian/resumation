import type { ReactNode } from "react";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  side: "left" | "right";
  open: boolean;
  title: string;
  children: ReactNode;
};

const Sidebar = ({ side, open, title, children }: SidebarProps) => {
  return (
    <aside className={`${styles.sidebar} ${styles[side]}${open ? ` ${styles.open}` : ""}`} aria-hidden={!open} inert={!open}>
      <h2>{title}</h2>
      <div className={styles.body}>{children}</div>
    </aside>
  );
};

export default Sidebar;
