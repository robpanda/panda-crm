import { useEffect, useRef, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import PandaSignRichTextEditor from './PandaSignRichTextEditor';
import PandaSignTokenPicker from './PandaSignTokenPicker';
import { DEFAULT_DYNAMIC_CONTENT_ITEM, PANDASIGN_TERRITORIES } from './pandasignV2AdminUtils';

export default function PandaSignDynamicContentManager({
  dynamicContentItems,
  territories,
  onSaveDynamicContentItem,
  savingDynamicContent,
}) {
  const [form, setForm] = useState(DEFAULT_DYNAMIC_CONTENT_ITEM);
  const editorRef = useRef(null);
  const territoryOptions = Array.isArray(territories) && territories.length > 0
    ? territories
    : PANDASIGN_TERRITORIES;

  useEffect(() => {
    if (form.id) {
      const latest = dynamicContentItems.find((item) => item.id === form.id);
      if (latest) {
        setForm({ ...DEFAULT_DYNAMIC_CONTENT_ITEM, ...latest });
      }
    }
  }, [dynamicContentItems, form.id]);

  const editItem = (item) => setForm({ ...DEFAULT_DYNAMIC_CONTENT_ITEM, ...item });

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Dynamic Legal Content</h2>
            <p className="text-sm text-gray-500">Reusable territory-aware content blocks such as rescission clauses.</p>
          </div>
          <button
            type="button"
            onClick={() => setForm(DEFAULT_DYNAMIC_CONTENT_ITEM)}
            className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Block
          </button>
        </div>

        <div className="space-y-3">
          {dynamicContentItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => editItem(item)}
              className="w-full rounded-2xl border border-gray-200 p-4 text-left transition hover:border-panda-primary"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">{item.key} • {item.territory}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                  {item.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {form.id ? 'Edit Dynamic Block' : 'Create Dynamic Block'}
          </h2>
          <p className="text-sm text-gray-500">Use merge keys like <code>{'{{dynamic.rescission_clause}}'}</code> in the template builder.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Key
            <input
              value={form.key}
              onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Territory
            <select
              value={form.territory}
              onChange={(event) => setForm((current) => ({ ...current, territory: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
            >
              {territoryOptions.map((territory) => (
                <option key={territory} value={territory}>
                  {territory}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="rounded border-gray-300"
            />
            Active
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium text-gray-700">
          Description
          <input
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
          />
        </label>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <PandaSignRichTextEditor
            ref={editorRef}
            value={form.content}
            onChange={(content) => setForm((current) => ({ ...current, content }))}
            onInsertToken={() => {}}
          />

          <PandaSignTokenPicker
            dynamicContentItems={dynamicContentItems}
            onInsertToken={(token) => {
              editorRef.current?.insertToken(token);
            }}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={savingDynamicContent}
            onClick={() => onSaveDynamicContentItem(form)}
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-panda-primary to-panda-secondary px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            <Save className="mr-2 h-4 w-4" />
            {savingDynamicContent ? 'Saving...' : 'Save Dynamic Block'}
          </button>
        </div>
      </section>
    </div>
  );
}
