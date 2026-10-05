import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { MoreHorizontal } from "lucide-preact";

export function ActionMenu({ label, children, disabled = false }: {
  label: string;
  children: ComponentChildren;
  disabled?: boolean;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    const onToggle = () => setExpanded(element.matches(":popover-open"));
    element.addEventListener("toggle", onToggle);
    return () => element.removeEventListener("toggle", onToggle);
  }, []);
  return <span class="action-menu">
    <button type="button" class="icon-button subtle" disabled={disabled}
      aria-label={label} title={label} aria-expanded={expanded} aria-controls={id}
      onClick={(event) => {
        const element = menu.current;
        if (!element) return;
        if (element.matches(":popover-open")) { element.hidePopover(); return; }
        element.showPopover();
        const rect = event.currentTarget.getBoundingClientRect();
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        element.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
        element.style.top = `${Math.max(12, rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 8 : rect.bottom + 8)}px`;
        element.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')?.focus();
      }}><MoreHorizontal size={18} aria-hidden="true" /></button>
    <div id={id} ref={menu} popover="auto" class="action-popover" aria-label={label}
      onClick={(event) => {
        if ((event.target as Element).closest('button, a[href]')) menu.current?.hidePopover();
      }}>{children}</div>
  </span>;
}
