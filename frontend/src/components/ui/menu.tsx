import { MoreHorizontal } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { cn } from "@/utils/cn";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-variants";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  /** Internal link; otherwise `onSelect` runs. */
  to?: string;
  onSelect?: () => void;
  tone?: "danger";
  disabled?: boolean;
}

export interface DropdownMenuProps {
  /** Accessible name of the trigger, e.g. "More actions for Data Scientist". */
  label: string;
  /** `null`/`false` entries are skipped, so items can be listed conditionally. */
  items: (MenuItem | null | false | undefined)[];
  /** Trigger content; defaults to a "⋯" icon. */
  trigger?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:bg-slate-100 focus:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-slate-400";

/**
 * Small actions menu ("⋯"). Rendered in a portal with fixed positioning so it isn't clipped by
 * scrolling table containers. Arrow keys move between items; Escape closes and refocuses the trigger.
 */
export function DropdownMenu({
  label,
  items,
  trigger,
  variant = "ghost",
  size = "icon-sm",
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const visible = items.filter((item): item is MenuItem => Boolean(item));

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = menuRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + 4;
    const top = height > 0 && below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below;
    setPosition({ top, right: Math.max(8, window.innerWidth - rect.right) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    const onViewportChange = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (nodes.length === 0) return;
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (event.key === "End") next = nodes.length - 1;
    else if (event.key === "ArrowDown") next = (current + 1) % nodes.length;
    else if (event.key === "ArrowUp") next = (current - 1 + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  if (visible.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={trigger ? undefined : "More actions"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={buttonClasses({ variant, size, className })}
      >
        {trigger ?? <MoreHorizontal aria-hidden />}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              // Clicks inside the menu must not reach clickable ancestors (e.g. table rows).
              onClick={(event) => event.stopPropagation()}
              style={position ? { top: position.top, right: position.right } : { top: 0, right: 0 }}
              className={cn(
                "fixed z-50 min-w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-slate-900/5",
                position ? "visible" : "invisible",
              )}
            >
              {visible.map((item) => {
                const itemClass = cn(
                  ITEM_CLASS,
                  item.tone === "danger" && "text-rose-700 hover:bg-rose-50 hover:text-rose-800 focus:bg-rose-50 [&_svg]:text-rose-500",
                );
                return item.to && !item.disabled ? (
                  <Link key={item.label} to={item.to} role="menuitem" className={itemClass} onClick={() => close(false)}>
                    {item.icon}
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    className={itemClass}
                    onClick={() => {
                      close(true);
                      item.onSelect?.();
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
