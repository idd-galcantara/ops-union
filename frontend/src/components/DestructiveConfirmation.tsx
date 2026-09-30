import React, { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Loader, Trash2, X } from 'lucide-react';

export interface DestructiveConfirmationProps {
  title: string;
  description: string;
  context?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function DestructiveConfirmation({
  title,
  description,
  context,
  confirmLabel,
  cancelLabel = 'Cancel',
  pending = false,
  error,
  onConfirm,
  onCancel,
  restoreFocusRef,
  fallbackFocusRef,
}: DestructiveConfirmationProps) {
  void React;
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmLockRef = useRef(false);

  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      const restoreTarget = restoreFocusRef?.current;
      const fallbackTarget = fallbackFocusRef?.current;
      if (restoreTarget && document.contains(restoreTarget)) restoreTarget.focus();
      else if (fallbackTarget && document.contains(fallbackTarget)) fallbackTarget.focus();
    };
  }, [fallbackFocusRef, restoreFocusRef]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleConfirm = async () => {
    if (pending || confirmLockRef.current) return;
    confirmLockRef.current = true;
    try {
      await onConfirm();
    } finally {
      confirmLockRef.current = false;
    }
  };

  return (
    <div
      className="preset-dialog-layer destructive-confirmation-layer"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="preset-secondary-dialog destructive-confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="preset-secondary-dialog-header">
          <div>
            <span className="eyebrow">Destructive action</span>
            <h3 id={titleId}>{title}</h3>
          </div>
          <button
            type="button"
            className="icon-button subtle"
            onClick={onCancel}
            aria-label={cancelLabel}
            disabled={pending}
          >
            <X size={15} />
          </button>
        </div>
        <p className="preset-dialog-summary" id={descriptionId}>{description}</p>
        {context && <div className="destructive-confirmation-context">{context}</div>}
        {error && <p className="preset-library-feedback is-error" role="alert">{error}</p>}
        <div className="preset-secondary-dialog-actions">
          <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
          <button type="button" className="primary-button danger-button" onClick={() => void handleConfirm()} disabled={pending}>
            {pending ? <Loader size={13} className="spinning" /> : <Trash2 size={13} />}
            {pending ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
