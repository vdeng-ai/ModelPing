import { useState } from "preact/hooks";
import { APP_LABELS, CC_APPS, buildDeepLink, launchCcSwitch, type CcApp } from "../lib/ccswitch.js";
import { useI18n } from "../lib/i18n.js";

interface Props {
  name: string;
  endpoint: string;
  apiKey: string;
  model?: string;
  defaultApp: CcApp;
  disabled?: boolean;
  onLaunched?: (msg: string) => void;
}

// 紧凑控件：[app 下拉][→ cc-switch]。下拉默认按协议推导，可改目标 app。
export function CcSwitchButton({ name, endpoint, apiKey, model, defaultApp, disabled, onLaunched }: Props) {
  const { t } = useI18n();
  const [app, setApp] = useState<CcApp>(defaultApp);

  const launch = (e: Event) => {
    e.stopPropagation();
    if (disabled) return;
    launchCcSwitch(buildDeepLink({ app, name, endpoint, apiKey, model }));
    onLaunched?.(t("ccswitch.launched", { app: APP_LABELS[app] }));
  };

  return (
    <span class="ccswitch-add" onClick={(e) => e.stopPropagation()}>
      <select
        class="ccswitch-app"
        value={app}
        title={t("ccswitch.targetApp")}
        disabled={disabled}
        onChange={(e) => setApp((e.target as HTMLSelectElement).value as CcApp)}
      >
        {CC_APPS.map((a) => <option value={a}>{APP_LABELS[a]}</option>)}
      </select>
      <button type="button" class="icon" title={t("ccswitch.importTitle")} disabled={disabled} onClick={launch}>
        → cc-switch
      </button>
    </span>
  );
}
