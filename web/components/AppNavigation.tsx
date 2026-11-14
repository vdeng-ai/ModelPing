import { Activity, Command, FlaskConical, History, ServerCog } from "lucide-preact";
import { useI18n } from "../lib/i18n.js";
import { hashForAppRoute, type AppRoute } from "../lib/navigation.js";
import { LangToggle } from "./LangToggle.js";
import { ThemeToggle } from "./ThemeToggle.js";

export const NAV_ITEMS = [
  { route: "test-models", label: "app.tabTest", icon: FlaskConical },
  { route: "test-history", label: "workbench.navHistory", icon: History },
  { route: "status", label: "app.tabStatus", icon: Activity },
  { route: "providers", label: "app.tabProviders", icon: ServerCog },
] as const;

export function AppNavigation({
  route,
  navigate,
  openCommands,
}: {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  openCommands: () => void;
}) {
  const { t } = useI18n();
  return (
    <header class="app-header">
      <div class="app-header-inner">
        <a
          class="brand-lockup"
          href="#test/models"
          onClick={(event) => {
            event.preventDefault();
            navigate("test-models");
          }}
        >
          <span class="brand-logo" aria-hidden="true">
            <Activity size={23} strokeWidth={2.2} />
          </span>
          <span class="brand-copy">
            <strong>
              ModelPing<span class="brand-dot">.</span>
            </strong>
            <span>API WORKSPACE</span>
          </span>
        </a>
        <span class="nav-section-label">{t("workbench.workspace")}</span>
        <nav class="primary-nav" aria-label={t("app.navLabel")}>
          {NAV_ITEMS.map(({ route: target, label, icon: Icon }) => (
            <a
              key={target}
              class={`nav-item${target === route ? " active" : ""}`}
              href={hashForAppRoute(target)}
              aria-current={target === route ? "page" : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigate(target);
              }}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{t(label)}</span>
            </a>
          ))}
        </nav>
        <div class="nav-bottom">
          <button
            class="command-trigger"
            aria-label={`${t("workbench.quickJump")} ⌘ / Ctrl K`}
            onClick={openCommands}
            aria-keyshortcuts="Control+k Meta+k"
          >
            <Command size={17} aria-hidden="true" />
            <span>{t("workbench.quickJump")}</span>
            <kbd aria-hidden="true">⌘ / Ctrl K</kbd>
          </button>
          <div class="app-utilities">
            <LangToggle />
            <ThemeToggle />
          </div>
          <span class="nav-footnote">{t("workbench.localNavigation")}</span>
        </div>
      </div>
    </header>
  );
}
