import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';
import { getDevelopmentApplicationDiagnosticRows } from '../services/applicationContract';
import type { ApplicationSubmissionDiagnostics } from '../services/applicationContract';

interface ApplicationErrorToastProps {
  message: string;
  diagnostics?: ApplicationSubmissionDiagnostics | null;
  onClose: () => void;
}

const TOAST_DURATION_MS = 6000;
const EXIT_DURATION_MS = 220;

export const ApplicationErrorToast: React.FC<ApplicationErrorToastProps> = ({ message, diagnostics, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);
  const diagnosticRows = import.meta.env.DEV
    ? getDevelopmentApplicationDiagnosticRows(diagnostics, true)
    : null;
  const isDismissing = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    setIsExiting(true);
    exitTimer.current = setTimeout(onClose, EXIT_DURATION_MS);
  }, [onClose]);

  useEffect(() => {
    const dismissTimer = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => {
      clearTimeout(dismissTimer);
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    };
  }, [dismiss]);

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[60] flex justify-center px-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-full sm:max-w-md sm:justify-end sm:px-0">
      <div
        role={diagnosticRows ? 'alertdialog' : 'alert'}
        aria-live="assertive"
        aria-atomic="true"
        aria-labelledby={diagnosticRows ? 'application-error-toast-title' : undefined}
        className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-lg font-manrope ${
          isExiting ? 'application-error-toast-exit' : 'application-error-toast-enter'
        }`}
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1">
          <p className="leading-relaxed">{message}</p>
          {diagnosticRows && (
            <section className="mt-3 border-t border-rose-200 pt-3 text-xs text-rose-900">
              <h2 id="application-error-toast-title" className="mb-2 font-bold">Texniki test məlumatı</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {diagnosticRows.map(({ label, value }) => (
                  <React.Fragment key={label}>
                    <dt className="font-semibold">{label}:</dt>
                    <dd className="break-words">{value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={diagnosticRows ? 'Bağla' : 'Bildirişi bağla'}
          className="-mr-1 -mt-1 inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-2 text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          {diagnosticRows ? 'Bağla' : <X aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
    </div>,
    document.body,
  );
};
