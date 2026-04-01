import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { PANDASIGN_DOCUMENT_TYPES, PANDASIGN_TERRITORIES } from './pandasignV2AdminUtils';

function buildDraft(values, fallback, requiredValues = []) {
  const source = Array.isArray(values) && values.length > 0 ? values : fallback;
  const seen = new Set();
  const result = [];

  source.forEach((value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  requiredValues.forEach((value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

function updateValue(list, index, nextValue) {
  const nextList = [...list];
  nextList[index] = nextValue;
  return nextList;
}

function removeValue(list, index) {
  return list.filter((_, itemIndex) => itemIndex !== index);
}

function EditableSettingsList({
  title,
  description,
  values,
  lockedValues = [],
  addLabel,
  placeholder,
  onChange,
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>

      <div className="space-y-3">
        {values.map((value, index) => {
          const isLocked = lockedValues.includes(value);
          return (
            <div key={`${title}-${value}-${index}`} className="flex items-center gap-2">
              <input
                value={value}
                disabled={isLocked}
                onChange={(event) => onChange(updateValue(values, index, event.target.value))}
                placeholder={placeholder}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
              {isLocked ? (
                <span className="rounded-full bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">
                  Required
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange(removeValue(values, index))}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-600 hover:border-red-300 hover:text-red-600"
                  aria-label={`Remove ${value || title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="mt-4 inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-panda-primary hover:text-panda-primary"
      >
        <Plus className="mr-2 h-4 w-4" />
        {addLabel}
      </button>
    </section>
  );
}

export default function PandaSignAdminSettingsModal({
  open,
  onClose,
  onSave,
  saving,
  territories,
  documentTypes,
}) {
  const [territoriesDraft, setTerritoriesDraft] = useState([]);
  const [documentTypesDraft, setDocumentTypesDraft] = useState([]);

  useEffect(() => {
    if (!open) return;
    setTerritoriesDraft(buildDraft(territories, PANDASIGN_TERRITORIES, ['DEFAULT']));
    setDocumentTypesDraft(buildDraft(documentTypes, PANDASIGN_DOCUMENT_TYPES, ['CONTRACT']));
  }, [open, territories, documentTypes]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">PandaSign V2 Settings</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage the territory and document-type options used across templates, branding, and dynamic content.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Close PandaSign settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 p-6 xl:grid-cols-2">
          <EditableSettingsList
            title="Territories"
            description="These values populate the territory dropdowns and territory-merge profile cards."
            values={territoriesDraft}
            lockedValues={['DEFAULT']}
            addLabel="Add Territory"
            placeholder="PA"
            onChange={setTerritoriesDraft}
          />

          <EditableSettingsList
            title="Document Types"
            description="These values appear in the PandaSign template type selectors and filters."
            values={documentTypesDraft}
            lockedValues={['CONTRACT']}
            addLabel="Add Document Type"
            placeholder="INSURANCE"
            onChange={setDocumentTypesDraft}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ territories: territoriesDraft, documentTypes: documentTypesDraft })}
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-panda-primary to-panda-secondary px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
