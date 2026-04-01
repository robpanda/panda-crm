import { Edit, FileSignature, Search, Send, Archive, Copy } from 'lucide-react';
import { PANDASIGN_DOCUMENT_TYPES, PANDASIGN_TEMPLATE_STATUSES, PANDASIGN_TERRITORIES } from './pandasignV2AdminUtils';

export default function PandaSignTemplateList({
  filters,
  onFiltersChange,
  templates,
  onCreate,
  onEdit,
  onDuplicate,
  onPublish,
  onArchive,
  documentTypes = PANDASIGN_DOCUMENT_TYPES,
  territories = PANDASIGN_TERRITORIES,
  isDuplicatingId,
  isPublishingId,
  isArchivingId,
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Agreement Templates</h2>
            <p className="text-sm text-gray-500">Draft, publish, and archive PandaSign V2 templates.</p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-panda-primary to-panda-secondary px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            <FileSignature className="mr-2 h-4 w-4" />
            New Template
          </button>
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.q}
              onChange={(event) => onFiltersChange({ ...filters, q: event.target.value })}
              placeholder="Search by name"
              className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 text-sm"
            />
          </label>

          <select
            value={filters.documentType}
            onChange={(event) => onFiltersChange({ ...filters, documentType: event.target.value })}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            <option value="">All document types</option>
            {documentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={filters.territory}
            onChange={(event) => onFiltersChange({ ...filters, territory: event.target.value })}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            <option value="">All territories</option>
            {territories.map((territory) => (
              <option key={territory} value={territory}>
                {territory}
              </option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            <option value="">All statuses</option>
            {PANDASIGN_TEMPLATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Template', 'Type', 'Territory', 'Status', 'Updated', 'Actions'].map((header) => (
                <th key={header} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {templates.map((template) => (
              <tr key={template.id}>
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{template.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{template.description || 'No description yet'}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">{template.documentType || template.category || 'CONTRACT'}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{template.territory || 'DEFAULT'}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    template.status === 'PUBLISHED'
                      ? 'bg-green-100 text-green-700'
                      : template.status === 'ARCHIVED'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}>
                    {template.status || 'DRAFT'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {template.updatedAt ? new Date(template.updatedAt).toLocaleString() : '—'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(template)}
                      className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
                    >
                      <Edit className="mr-1 h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isDuplicatingId === template.id}
                      onClick={() => onDuplicate(template)}
                      className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Copy className="mr-1 h-4 w-4" />
                      {isDuplicatingId === template.id ? 'Duplicating...' : 'Duplicate'}
                    </button>
                    {template.status !== 'PUBLISHED' && (
                      <button
                        type="button"
                        disabled={isPublishingId === template.id}
                        onClick={() => onPublish(template)}
                        className="inline-flex items-center rounded-lg border border-green-200 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        <Send className="mr-1 h-4 w-4" />
                        {isPublishingId === template.id ? 'Publishing...' : 'Publish'}
                      </button>
                    )}
                    {template.status !== 'ARCHIVED' && (
                      <button
                        type="button"
                        disabled={isArchivingId === template.id}
                        onClick={() => onArchive(template)}
                        className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Archive className="mr-1 h-4 w-4" />
                        {isArchivingId === template.id ? 'Archiving...' : 'Archive'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {templates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-500">
                  No templates match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
