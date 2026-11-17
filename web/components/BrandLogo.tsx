// Keep the cache version aligned with web/index.html; both use one fixed-color asset.
export const BRAND_LOGO_URL = "/favicon.svg?v=brand-activity-1";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <img
      class={`brand-logo${className ? ` ${className}` : ""}`}
      src={BRAND_LOGO_URL}
      width={38}
      height={38}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
