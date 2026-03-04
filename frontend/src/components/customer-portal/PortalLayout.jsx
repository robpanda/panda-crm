export default function PortalLayout({ title, subtitle, jobId, brand = {}, children }) {
  const defaults = {
    name: title || brand.name || 'Panda Exteriors',
    subtitle: subtitle || brand.subtitle || 'Customer Portal',
    logoSrc: brand.logoSrc || '/panda-logo.svg',
    primary: brand.primary || '#f88000',
    secondary: brand.secondary || '#68a000',
    accent: brand.accent || '#f8b848',
  };

  return (
    <div
      className="min-h-screen bg-slate-100"
      style={{
        '--portal-primary': defaults.primary,
        '--portal-secondary': defaults.secondary,
        '--portal-accent': defaults.accent,
        '--portal-muted': '#6b7280',
      }}
    >
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            {defaults.logoSrc && (
              <img
                src={defaults.logoSrc}
                alt={defaults.name}
                className="h-10 w-10 object-contain"
              />
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--portal-muted)]">
                {defaults.subtitle}
              </p>
              <h1 className="text-lg font-semibold text-gray-900">{defaults.name}</h1>
            </div>
          </div>
          {jobId && (
            <div className="rounded-full bg-[color:var(--portal-accent)]/20 px-3 py-1 text-xs font-semibold text-[color:var(--portal-primary)]">
              Job {jobId}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
