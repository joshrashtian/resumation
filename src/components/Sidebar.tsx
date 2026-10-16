import type { ReactNode } from "react";
import "./Sidebar.css";

type SidebarProps = {
  side: "left" | "right";
  open: boolean;
  title: string;
  children: ReactNode;
};

const Sidebar = ({ side, open, title, children }: SidebarProps) => {
  return (
    <aside className={`sidebar sidebar-${side}${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
      <h2>{title}</h2>
      <div className="sidebar-body">{children}</div>
    </aside>
  );
};

export default Sidebar;
