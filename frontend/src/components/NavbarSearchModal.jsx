import { Search, X } from 'lucide-react';

const SEARCH_MODULE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'leads', label: 'Leads' },
  { value: 'opportunities', label: 'Jobs' },
  { value: 'invoices', label: 'Invoices' },
];

export default function NavbarSearchModal({
  searchQuery,
  searchModule,
  onSearchQueryChange,
  onSearchModuleChange,
  onClose,
  onSubmit,
}) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto flex h-full w-full max-w-3xl items-start justify-center">
        <div
          className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 md:px-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900 md:text-lg">Universal Search</h2>
              <p className="text-sm text-gray-500">
                Search accounts, contacts, leads, jobs, invoices, phone numbers, addresses, emails, and mentions.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={onSubmit} className="border-b border-gray-100 px-4 py-4 md:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                autoFocus
                placeholder="Type a name, invoice, address, phone, email, or mention..."
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 text-base outline-none transition-shadow focus:border-panda-primary focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
          </form>

          <div className="max-h-[70vh] overflow-y-auto px-4 py-4 md:px-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Search in</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SEARCH_MODULE_OPTIONS.map((option) => {
                const isSelected = searchModule === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSearchModuleChange(option.value)}
                    className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                      isSelected
                        ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-panda-primary/30 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-900">Search tips</p>
              <p>Use full or partial names, emails, phone numbers, addresses, invoice numbers, or mention text.</p>
              <p>
                Pick a module above to narrow results, or leave it on <span className="font-medium">All</span> for a
                cross-CRM search.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 sm:flex-row sm:justify-end md:px-5">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full rounded-xl bg-panda-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-panda-primary/90 sm:w-auto"
            >
              Search
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
