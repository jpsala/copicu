import { Menu, useMenuContext } from "@mantine/core";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.mjs";
import { createPortal } from "react-dom";
import { type ReactNode, useEffect, useRef, useState } from "react";

function focusFirstItem(menu: HTMLDivElement | null) {
  menu?.querySelector<HTMLElement>("[data-menu-item]:not([data-disabled])")?.focus({ preventScroll: true });
}

export function ItemContextMenu({ x, y, children, onClose, returnFocus, fallbackFocus }: {
  x: number;
  y: number;
  children: ReactNode;
  onClose: () => void;
  returnFocus: HTMLElement | null;
  fallbackFocus: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => focusFirstItem(menuRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [x, y]);

  return createPortal(
    <Menu opened onChange={(opened) => { if (!opened) onClose(); }} position="bottom-start"
      offset={0} width={252} withinPortal={false} returnFocus={false} trapFocus={false}
      clickOutsideEvents={["mousedown", "touchstart"]}
      closeOnEscape={false} withInitialFocusPlaceholder={false} transitionProps={{ duration: 0 }}
      floatingStrategy="fixed" zIndex={20}>
      <Menu.Target>
        <span aria-hidden="true" style={{ position: "fixed", left: x, top: y, width: 0, height: 0 }} />
      </Menu.Target>
      <Menu.Dropdown ref={menuRef} className="item-menu" aria-label="Item actions"
        onClick={(event) => {
          event.stopPropagation();
          const action = event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null;
          if (action && !action.hasAttribute("aria-haspopup")) onClose();
        }}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            window.setTimeout(() => returnFocus?.isConnected ? returnFocus.focus() : fallbackFocus(), 0);
          }
        }}>
        {children}
      </Menu.Dropdown>
    </Menu>,
    document.body,
  );
}

// Mantine handles placement, typeahead and vertical navigation. A controlled
// nested Menu also opens on click/touch and returns to its trigger on Escape.
export function ItemContextSubmenu({ label, icon, children }: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const parentMenu = useMenuContext();
  const [opened, setOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (opened) return parentMenu.registerOpenSub(() => setOpened(false));
  }, [opened, parentMenu.registerOpenSub]);
  useEffect(() => {
    if (!opened) return;
    const frame = window.requestAnimationFrame(() => focusFirstItem(menuRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [opened]);

  return (
    <Menu opened={opened} onChange={setOpened} trigger="click" position="right-start"
      offset={0} width={272} withinPortal returnFocus={false}
      floatingStrategy="fixed" preventPositionChangeWhenVisible={false}
      middlewares={{ shift: { crossAxis: true, padding: 8 } }}
      closeOnClickOutside={false} closeOnEscape={false} trapFocus={false}
      withInitialFocusPlaceholder={false} transitionProps={{ duration: 0 }} zIndex={21}>
      <Menu.Target>
        <Menu.Item ref={triggerRef} closeMenuOnClick={false} leftSection={icon}
          rightSection={<ChevronRight size={14} aria-hidden="true" />}
          onKeyDown={(event) => {
            if (["ArrowRight", "Enter", " "].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              setOpened(true);
              if (opened) focusFirstItem(menuRef.current);
            }
          }}>
          {label}
        </Menu.Item>
      </Menu.Target>
      <Menu.Dropdown ref={menuRef} className="item-menu item-submenu" aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpened(false);
            triggerRef.current?.focus();
          }
        }}>
        {children}
      </Menu.Dropdown>
    </Menu>
  );
}
