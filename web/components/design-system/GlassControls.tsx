import type { ComponentChildren, JSX } from "preact";

interface SegmentedProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class"> {
  class?: string;
  children: ComponentChildren;
}

interface GlassButtonProps extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, "class"> {
  class?: string;
  active?: boolean;
  children: ComponentChildren;
}

/** Near-colorless Standard Glass container for segmented controls and compact navigation. */
export function GlassSegmentedControl({ class: className = "", children, ...props }: SegmentedProps) {
  return (
    <div class={`ds-glass ds-glass--thin ds-segmented ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

/** Thin by default; active state receives only a restrained amethyst accent. */
export function GlassButton({ class: className = "", active = false, children, ...props }: GlassButtonProps) {
  return (
    <button
      class={`ds-control ${active ? "ds-control--active active" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
