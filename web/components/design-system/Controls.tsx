import type { ComponentChildren, JSX } from "preact";

export function SegmentedControl({
  class: className = "",
  children,
  ...props
}: Omit<JSX.HTMLAttributes<HTMLDivElement>, "class"> & { class?: string; children: ComponentChildren }) {
  return (
    <div class={`ds-segmented ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function SegmentButton({
  class: className = "",
  active = false,
  children,
  ...props
}: Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "class"> & {
  class?: string;
  active?: boolean;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class={`ds-control ${active ? "ds-control--active active" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
