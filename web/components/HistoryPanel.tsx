import type { HistoryEntry } from "../lib/types.js";
import { fmtMs, fmtTok, fmtTime, PROTOCOL_LABEL, streamGlyph } from "../lib/format.js";
import { maskKey } from "../lib/storage.js";
import { PROTOCOL_TO_APP } from "../lib/ccswitch.js";
import { CopyButton } from "./CopyButton.js";
import { CcSwitchButton } from "./CcSwitchButton.js";

interface Props {
  entries: HistoryEntry[];
  persist: boolean;
  onTogglePersist: (on: boolean) => void;
  onClear: () => void;
  onLaunched: (msg: string) => void;
}

function exportJson(entries: HistoryEntry[]) {
  // 导出时保留 key（用户自己机器），便于复盘。
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `llm-test-history-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function HistoryPanel({ entries, persist, onTogglePersist, onClear, onLaunched }: Props) {
  return (
    <section class="panel">
      <h2>历史记录</h2>
      <div class="history-controls">
        <label class="toggle">
          <input type="checkbox" checked={persist} onChange={(e) => onTogglePersist((e.target as HTMLInputElement).checked)} />
          持久化保存（localStorage）
        </label>
        <span class="spacer" />
        <button disabled={!entries.length} onClick={() => exportJson(entries)}>导出 JSON</button>
        <button disabled={!entries.length} onClick={onClear}>清空</button>
      </div>

      {!persist ? (
        <div class="status-text" style="margin-bottom:8px">
          持久化已关闭：记录仅保留在当前页面，刷新后清空。
        </div>
      ) : null}

      <table class="models">
        <thead>
          <tr>
            <th>时间</th>
            <th>供应商</th>
            <th>请求 URL</th>
            <th>Key</th>
            <th>模型</th>
            <th>状态</th>
            <th class="num">延迟</th>
            <th class="num">TTFT</th>
            <th class="num">in/out/total</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={10} class="empty">还没有测试记录。</td></tr>
          ) : (
            entries.map((h) => {
              const requestUrl = h.result.requestUrl || h.baseUrl;
              const g = streamGlyph(h.streamVerdict);
              return (
                <tr key={h.id}>
                  <td class="status-text">{fmtTime(h.ts)}</td>
                  <td>{h.providerName}</td>
                  <td>
                    <span class="copy-pair">
                      <span
                        class="url-cell"
                        title={`请求 URL: ${requestUrl}\nBase URL: ${h.baseUrl}${h.isFullUrl ? "\n完整 URL" : ""}`}
                      >
                        {requestUrl}
                      </span>
                      <CopyButton value={requestUrl} title="复制请求 URL" />
                    </span>
                  </td>
                  <td>
                    <span class="copy-pair">
                      <span class="mask">{maskKey(h.apiKey) || "—"}</span>
                      {h.apiKey ? <CopyButton value={h.apiKey} title="复制 Key" /> : null}
                    </span>
                  </td>
                  <td>
                    <span class="model-name" title={h.protocol}>{h.modelLabel}</span>{" "}
                    <span class={"pbadge " + (h.result.ok ? "success" : "fail")} title={h.protocol}>
                      <span class="pbadge-label">{PROTOCOL_LABEL[h.protocol]}</span>
                      {g ? <span class={"stream-mark " + g.cls}>{g.char}</span> : null}
                    </span>
                  </td>
                  <td>
                    <span class={"status-cell" + (!h.result.ok && (h.result.failureLog || h.result.error) ? " has-pop" : "")}>
                      <span class={"status-text" + (h.result.ok ? "" : " fail")}>
                        <span class={"dot " + (h.result.ok ? "success" : "fail")} />
                        {h.result.ok ? "通过" : `失败(${h.result.status || "—"})`}
                      </span>
                      {!h.result.ok && (h.result.failureLog || h.result.error) ? (
                        <div class="failure-pop"><pre>{h.result.failureLog || h.result.error}</pre></div>
                      ) : null}
                    </span>
                  </td>
                  <td class="num">{fmtMs(h.result.latencyMs)}</td>
                  <td class="num">{fmtMs(h.result.ttftMs)}</td>
                  <td class="num">
                    {fmtTok(h.result.usage.inputTokens)}/{fmtTok(h.result.usage.outputTokens)}/{fmtTok(h.result.usage.totalTokens)}
                  </td>
                  <td>
                    {h.result.ok ? (
                      <CcSwitchButton
                        name={`${h.providerName} - ${h.modelLabel}`}
                        endpoint={h.baseUrl}
                        apiKey={h.apiKey}
                        model={h.model}
                        defaultApp={PROTOCOL_TO_APP[h.protocol]}
                        onLaunched={onLaunched}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
