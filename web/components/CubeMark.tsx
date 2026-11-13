/** Filled active cube and outlined inactive cube from the approved workbench. */
export function CubeMark({ size = 20, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m12 2 10 5v10l-10 5-10-5V7Z" />
      <path
        d="m2 7 10 5 10-5M12 12v10M7 4.5l10 5"
        fill="none"
        stroke={filled ? "white" : "currentColor"}
        stroke-width="1.4"
      />
    </svg>
  );
}
