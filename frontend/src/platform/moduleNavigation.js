function splitPathAndSuffix(rawPath = '') {
  const value = String(rawPath || '').trim();
  const match = value.match(/^([^?#]*)(.*)$/);
  return {
    pathname: match?.[1] || '',
    suffix: match?.[2] || '',
  };
}

export function resolveAnalyticsHandoffPath(rawPath = '') {
  const { pathname, suffix } = splitPathAndSuffix(rawPath);

  if (!pathname) return '/analytics/overview';
  if (pathname === '/analytics') return `/analytics/overview${suffix}`;
  if (pathname.startsWith('/analytics/')) return `${pathname}${suffix}`;

  if (pathname === '/reports') return `/analytics/reports${suffix}`;
  if (pathname === '/reports/builder') return `/analytics/reports/new${suffix}`;
  if (pathname.startsWith('/reports/builder/')) {
    return `/analytics/reports/${pathname.slice('/reports/builder/'.length)}/edit${suffix}`;
  }
  if (pathname === '/reports/advanced') return `/analytics/reports/advanced/new${suffix}`;
  if (pathname.startsWith('/reports/advanced/')) {
    return `/analytics/reports/advanced/${pathname.slice('/reports/advanced/'.length)}${suffix}`;
  }
  if (pathname.startsWith('/reports/')) {
    return `/analytics/reports/${pathname.slice('/reports/'.length)}${suffix}`;
  }

  if (pathname === '/dashboards') return `/analytics/dashboards${suffix}`;
  if (pathname === '/dashboards/default') return `/analytics/dashboards/executive${suffix}`;
  if (pathname === '/dashboards/custom') return `/analytics/dashboards${suffix}`;
  if (pathname === '/dashboards/claims-onboarding') {
    return `/analytics/dashboards/claims-onboarding${suffix}`;
  }
  if (pathname === '/dashboards/builder') return `/analytics/dashboards/new${suffix}`;
  if (pathname.startsWith('/dashboards/builder/')) {
    return `/analytics/dashboards/${pathname.slice('/dashboards/builder/'.length)}/edit${suffix}`;
  }
  if (pathname.startsWith('/dashboards/')) {
    return `/analytics/dashboards/${pathname.slice('/dashboards/'.length)}${suffix}`;
  }

  return `${pathname}${suffix}`;
}

export function isAnalyticsHandoffPath(rawPath = '') {
  const { pathname } = splitPathAndSuffix(rawPath);
  return (
    pathname === '/analytics'
    || pathname.startsWith('/analytics/')
    || pathname === '/reports'
    || pathname.startsWith('/reports/')
    || pathname === '/dashboards'
    || pathname.startsWith('/dashboards/')
  );
}
