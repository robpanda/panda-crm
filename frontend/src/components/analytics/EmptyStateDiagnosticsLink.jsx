import { useMemo, useState } from 'react';
import DiagnosticsDrawer from './DiagnosticsDrawer';
import { normalizeDiagnosticsContext } from '../../utils/analyticsDiagnostics';

export default function EmptyStateDiagnosticsLink({ context, className = '' }) {
  const [open, setOpen] = useState(false);

  const computedContext = useMemo(() => normalizeDiagnosticsContext(context), [context]);

  if (!computedContext) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs text-indigo-600 hover:text-indigo-700 hover:underline ${className}`}
      >
        Why is this empty?
      </button>
      <DiagnosticsDrawer open={open} onClose={() => setOpen(false)} context={computedContext} />
    </>
  );
}
