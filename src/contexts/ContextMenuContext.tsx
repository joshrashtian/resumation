import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import ContextMenu from "../components/ContextMenu";

// Same shape as MesaConnect's menu buttons; `visible` defaults to true.
export type ContextMenuButton = {
  name: string;
  function: () => void;
  visible?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
};

type MenuState = { x: number; y: number; buttons: ContextMenuButton[] } | null;

type ContextMenuValue = {
  open: (e: MouseEvent, buttons: ContextMenuButton[]) => void;
  close: () => void;
};

const MenuContext = createContext<ContextMenuValue | null>(null);

export const ContextMenuProvider = ({ children }: { children: ReactNode }) => {
  const [menu, setMenu] = useState<MenuState>(null);

  const open = useCallback((e: MouseEvent, buttons: ContextMenuButton[]) => {
    e.preventDefault();
    // Innermost handler wins, so a row's menu isn't replaced by its container's.
    e.stopPropagation();
    const shown = buttons.filter((b) => b.visible !== false);
    if (!shown.length) return;
    setMenu({ x: e.clientX, y: e.clientY, buttons: shown });
  }, []);

  const close = useCallback(() => setMenu(null), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <MenuContext.Provider value={value}>
      {children}
      {menu && <ContextMenu x={menu.x} y={menu.y} buttons={menu.buttons} onClose={close} />}
    </MenuContext.Provider>
  );
};

// Usage: onContextMenu={(e) => createContext(e, [{ name: "Open", function: ... }])}
export function useContextMenu() {
  const context = useContext(MenuContext);
  if (!context) throw new Error("useContextMenu must be used within ContextMenuProvider");

  return { createContext: context.open, closeContext: context.close, getContext: () => context };
}
