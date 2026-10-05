/** The approved filled status symbol; text always accompanies it. */
export function StatusMark({ state }: { state: "success" | "fail" | "idle" | "testing" }) {
  return (
    <svg class={"status-mark " + state} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      {state === "success" ? (
        <path
          d="m5.5 10 3 3 6-6"
          fill="none"
          stroke="white"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      ) : state === "fail" ? (
        <>
          <path d="M10 5.5v5" stroke="white" stroke-width="1.8" stroke-linecap="round" />
          <circle cx="10" cy="14" r="1" fill="white" />
        </>
      ) : (
        <path d="M6 10h8" stroke="white" stroke-width="1.8" stroke-linecap="round" />
      )}
    </svg>
  );
}
