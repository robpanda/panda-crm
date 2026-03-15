import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Eye, Save, Send, X } from 'lucide-react';
import PandaSignRichTextEditor from './PandaSignRichTextEditor';
import PandaSignSignerConfigPanel from './PandaSignSignerConfigPanel';
import PandaSignTokenPicker from './PandaSignTokenPicker';
import {
  PANDASIGN_DOCUMENT_TYPES,
  PANDASIGN_TERRITORIES,
  buildTemplatePayload,
  normalizeTemplateDraft,
  renderTemplatePreview,
  validateTemplateDraft,
} from './pandasignV2AdminUtils';

export default function PandaSignTemplateEditor({
  template,
  resources,
  onClose,
  onSave,
  onPublish,
  saving,
  publishing,
}) {
  const [draft, setDraft] = useState(normalizeTemplateDraft(template));
  const [showPreview, setShowPreview] = useState(true);
  const editorRef = useRef(null);

  useEffect(() => {
    setDraft(normalizeTemplateDraft(template));
  }, [template]);

  const brandingItems = resources.brandingItems || [];
  const dynamicContentItems = resources.dynamicContentItems || [];
  const validation = useMemo(() => validateTemplateDraft(draft, resources), [draft, resources]);
  const previewHtml = useMemo(() => renderTemplatePreview(draft, resources), [draft, resources]);

  const headers = brandingItems.filter((item) => item.kind === 'HEADER' && item.isActive !== false);
  const footers = brandingItems.filter((item) => item.kind === 'FOOTER' && item.isActive !== false);

  const saveDraft = () => onSave(buildTemplatePayload(draft));
  const publishDraft = () => onPublish(buildTemplatePayload(draft));

  return (
    <div className="space-y-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {draft.id ? 'Edit Agreement Template' : 'Create Agreement Template'}
          </h2>
          <p className="text-sm text-gray-500">
            WYSIWYG authoring for PandaSign V2 contracts with territory-aware branding and legal blocks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((current) => !current)}
            className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
          >
            <Eye className="mr-2 h-4 w-4" />
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <X className="mr-2 h-4 w-4" />
            Close
          </button>
        </div>
      </div>

      {!validation.valid && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Publish requirements are not met yet.</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
                {validation.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <label className="block text-sm font-medium text-gray-700">
          Template Name
          <input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Description
          <input
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Document Type
          <select
            value={draft.documentType}
            onChange={(event) => setDraft((current) => ({ ...current, documentType: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            {PANDASIGN_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Territory
          <select
            value={draft.territory}
            onChange={(event) => setDraft((current) => ({ ...current, territory: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            {PANDASIGN_TERRITORIES.map((territory) => (
              <option key={territory} value={territory}>
                {territory}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <label className="block text-sm font-medium text-gray-700">
          Header
          <select
            value={draft.branding.headerId}
            onChange={(event) => setDraft((current) => ({
              ...current,
              branding: { ...current.branding, headerId: event.target.value },
            }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            <option value="">Select header</option>
            {headers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.territory})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Footer
          <select
            value={draft.branding.footerId}
            onChange={(event) => setDraft((current) => ({
              ...current,
              branding: { ...current.branding, footerId: event.target.value },
            }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            <option value="">Select footer</option>
            {footers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.territory})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-gray-700">
        Dynamic Content Blocks
        <div className="mt-2 flex flex-wrap gap-2">
          {dynamicContentItems.map((item) => {
            const selected = draft.dynamicContentRefs.includes(item.key);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setDraft((current) => ({
                  ...current,
                  dynamicContentRefs: selected
                    ? current.dynamicContentRefs.filter((value) => value !== item.key)
                    : [...current.dynamicContentRefs, item.key],
                }))}
                className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                  selected
                    ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                    : 'border-gray-200 text-gray-700 hover:border-panda-primary'
                }`}
              >
                {item.name} ({item.territory})
              </button>
            );
          })}
        </div>
      </label>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          <PandaSignRichTextEditor
            ref={editorRef}
            value={draft.content}
            onChange={(content) => setDraft((current) => ({ ...current, content }))}
            onInsertToken={() => {}}
          />
        </div>

        <div className="space-y-4">
          <PandaSignTokenPicker
            dynamicContentItems={dynamicContentItems}
            onInsertToken={(token) => {
              editorRef.current?.insertToken(token);
            }}
          />

          {showPreview && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Preview</h3>
              <div
                className="prose prose-sm max-w-none rounded-2xl bg-gray-50 p-4"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
        </div>
      </div>

      <PandaSignSignerConfigPanel
        signerRoles={draft.signerRoles}
        requiredFieldsConfig={draft.requiredFieldsConfig}
        onSignerRolesChange={(signerRoles) => setDraft((current) => ({ ...current, signerRoles }))}
        onRequiredFieldsChange={(requiredFieldsConfig) => setDraft((current) => ({ ...current, requiredFieldsConfig }))}
      />

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving}
          className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:border-panda-primary hover:text-panda-primary disabled:opacity-60"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          type="button"
          onClick={publishDraft}
          disabled={publishing || !validation.valid}
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-panda-primary to-panda-secondary px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
        >
          <Send className="mr-2 h-4 w-4" />
          {publishing ? 'Publishing...' : 'Publish Template'}
        </button>
      </div>
    </div>
  );
}
