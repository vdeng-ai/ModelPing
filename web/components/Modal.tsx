import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useLayoutEffect, useRef } from "preact/hooks";

/** Native top-layer dialog: the browser owns inertness, Escape and focus containment. */
export function Modal({
  children,
  onClose,
  labelledBy,
  describedBy,
  className = "",
  alert = false,
}: {
  children: ComponentChildren;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  alert?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pointerStartedOutside = useRef(false);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  const outside = (event: PointerEvent, dialog: HTMLDialogElement) => {
    const box = dialog.getBoundingClientRect();
    return (
      event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
    );
  };
  return createPortal(
    <dialog
      ref={ref}
      class={`modal ${className}`}
      role={alert ? "alertdialog" : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pointerStartedOutside.current = event.target === event.currentTarget && outside(event, event.currentTarget);
      }}
      onPointerUp={(event) => {
        if (
          pointerStartedOutside.current &&
          event.target === event.currentTarget &&
          outside(event, event.currentTarget)
        )
          onClose();
        pointerStartedOutside.current = false;
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
