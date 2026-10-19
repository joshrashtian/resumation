import type { ReactNode } from "react";
import styles from "./TabBar.module.css";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
};

type TabBarProps<T extends string> = {
  tabs: TabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
};

function TabBar<T extends string>({ tabs, active, onSelect }: TabBarProps<T>) {
  return (
    <div className={styles.tabBar} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === active}
          title={tab.shortcut ? `${tab.label} (${tab.shortcut})` : tab.label}
          className={tab.id === active ? `${styles.tab} ${styles.active}` : styles.tab}
          onClick={() => onSelect(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export default TabBar;
