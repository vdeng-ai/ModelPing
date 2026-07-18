import { useRef } from "preact/hooks";
import { Trash2, X } from "lucide-preact";
import { useI18n } from "../lib/i18n.js";
import { useModalA11y } from "./useModalA11y.js";

interface Props {
  title: string;
  description: string;
  itemsLabel?: string;
  items?: string[];
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  description,
  itemsLabel,
  items = [],
  confirmLabel,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "confirm-modal-title";
  const descriptionId = "confirm-modal-description";

  useModalA11y(onClose, dialogRef);

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        class="modal modal-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" class="icon-button subtle" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div class="modal-confirm-body">
          <p id={descriptionId}>{description}</p>
          {items.length ? (
            <div class="modal-confirm-items">
              {itemsLabel ? <strong>{itemsLabel}</strong> : null}
              <ul>
                {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <div class="modal-actions">
          <span class="spacer" />
          <button type="button" data-autofocus="true" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" class="danger" onClick={onConfirm}>
            <Trash2 size={16} aria-hidden="true" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
