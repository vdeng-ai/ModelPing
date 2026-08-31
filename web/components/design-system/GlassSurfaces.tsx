import type { ComponentChildren, JSX, Ref } from "preact";

type GlassThickness = "thin" | "regular" | "thick";
type GlassLevel = "standard" | "optical";

function glassClass(level: GlassLevel, thickness: GlassThickness, className = "", accent = false) {
  return [
    "ds-glass",
    `ds-glass--${thickness}`,
    level === "optical" ? "ds-glass--optical" : "",
    accent ? "ds-glass--accent" : "",
    className,
  ].filter(Boolean).join(" ");
}

interface BaseSurfaceProps {
  children: ComponentChildren;
  class?: string;
  level?: GlassLevel;
  thickness?: GlassThickness;
  accent?: boolean;
}

export function GlassSurface({
  children,
  class: className = "",
  level = "standard",
  thickness = "regular",
  accent = false,
  ...props
}: BaseSurfaceProps & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class">) {
  return <div class={glassClass(level, thickness, className, accent)} {...props}>{children}</div>;
}

export function GlassNav({
  children,
  class: className = "",
  level = "standard",
  thickness = "regular",
  accent = false,
  ...props
}: BaseSurfaceProps & Omit<JSX.HTMLAttributes<HTMLElement>, "class">) {
  return <nav class={glassClass(level, thickness, className, accent)} {...props}>{children}</nav>;
}

export function GlassToolbar({
  children,
  class: className = "",
  level = "standard",
  thickness = "regular",
  accent = false,
  ...props
}: BaseSurfaceProps & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class">) {
  return <div class={glassClass(level, thickness, className, accent)} role="toolbar" {...props}>{children}</div>;
}

interface RefSurfaceProps extends BaseSurfaceProps {
  elementRef?: Ref<HTMLDivElement>;
}

export function GlassDialog({
  children,
  class: className = "",
  level = "optical",
  thickness = "thick",
  accent = false,
  elementRef,
  ...props
}: RefSurfaceProps & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "ref">) {
  return <div ref={elementRef} class={glassClass(level, thickness, className, accent)} {...props}>{children}</div>;
}

export function GlassPopover({
  children,
  class: className = "",
  level = "optical",
  thickness = "regular",
  accent = false,
  elementRef,
  ...props
}: RefSurfaceProps & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "ref">) {
  return <div ref={elementRef} class={glassClass(level, thickness, className, accent)} {...props}>{children}</div>;
}

export function GlassSheet({
  children,
  class: className = "",
  level = "optical",
  thickness = "thick",
  accent = false,
  elementRef,
  ...props
}: RefSurfaceProps & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "ref">) {
  return <div ref={elementRef} class={glassClass(level, thickness, `ds-sheet ${className}`, accent)} {...props}>{children}</div>;
}
