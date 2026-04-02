import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveAnalyticsHandoffPath } from './moduleNavigation';

export default function AnalyticsLegacyHandoffRoute() {
  const location = useLocation();
  const target = resolveAnalyticsHandoffPath(
    `${location.pathname}${location.search}${location.hash}`
  );

  useEffect(() => {
    if (window.location.pathname + window.location.search + window.location.hash === target) {
      return;
    }

    window.location.replace(target);
  }, [target]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Opening Analytics</h1>
        <p className="mt-2 text-sm text-gray-500">
          Redirecting you to the Analytics app.
        </p>
        <a
          href={target}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Continue
        </a>
      </div>
    </div>
  );
}
