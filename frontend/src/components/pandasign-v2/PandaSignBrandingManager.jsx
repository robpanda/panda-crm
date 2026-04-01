import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import PandaSignRichTextEditor from './PandaSignRichTextEditor';
import PandaSignTokenPicker from './PandaSignTokenPicker';
import PandaSignBrandingPreview from './PandaSignBrandingPreview';
import { PANDASIGN_TERRITORIES } from './pandasignV2AdminUtils';

const EMPTY_BRANDING_FORM = {
  id: '',
  kind: 'HEADER',
  name: '',
  territory: 'DEFAULT',
  description: '',
  content: '',
  isActive: true,
};

export default function PandaSignBrandingManager({
  brandingItems,
  territoryProfiles,
  dynamicContentItems,
  territories,
  onSaveBrandingItem,
  onSaveTerritoryProfiles,
  savingBranding,
  savingTerritoryProfiles,
}) {
  const [form, setForm] = useState(EMPTY_BRANDING_FORM);
  const [profilesDraft, setProfilesDraft] = useState(territoryProfiles);
  const editorRef = useRef(null);

  const groupedItems = useMemo(() => ({
    HEADER: brandingItems.filter((item) => item.kind === 'HEADER'),
    FOOTER: brandingItems.filter((item) => item.kind === 'FOOTER'),
  }), [brandingItems]);
  const territoryOptions = Array.isArray(territories) && territories.length > 0
    ? territories
    : PANDASIGN_TERRITORIES;

  useEffect(() => {
    setProfilesDraft(territoryProfiles);
  }, [territoryProfiles]);

  const editItem = (item) => setForm({ ...EMPTY_BRANDING_FORM, ...item });

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {form.id ? 'Edit Branding Asset' : 'Create Branding Asset'}
            </h2>
            <p className="text-sm text-gray-500">
              Build header and footer assets with merge fields, tables, background colors, divider styling, and images.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm(EMPTY_BRANDING_FORM)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Reset
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <label className="block text-sm font-medium text-gray-700">
            Kind
            <select
              value={form.kind}
              onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
            >
              <option value="HEADER">Header</option>
              <option value="FOOTER">Footer</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 pt-8">
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
          <div className="space-y-4">
            <PandaSignRichTextEditor
              ref={editorRef}
              value={form.content}
              onChange={(content) => setForm((current) => ({ ...current, content }))}
              onInsertToken={() => {}}
            />
            <PandaSignBrandingPreview
              title={`${form.kind === 'FOOTER' ? 'Footer' : 'Header'} Preview`}
              content={form.content}
              territory={form.territory}
              resources={{
                brandingItems: [],
                dynamicContentItems,
                territoryProfiles: profilesDraft,
              }}
            />
          </div>

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
            disabled={savingBranding}
            onClick={() => onSaveBrandingItem(form)}
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-panda-primary to-panda-secondary px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            <Save className="mr-2 h-4 w-4" />
            {savingBranding ? 'Saving...' : 'Save Branding Asset'}
          </button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {['HEADER', 'FOOTER'].map((kind) => (
          <section key={kind} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{kind === 'HEADER' ? 'Headers' : 'Footers'}</h2>
                <p className="text-sm text-gray-500">Reusable {kind.toLowerCase()} templates by territory.</p>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...EMPTY_BRANDING_FORM, kind })}
                className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                <Plus className="mr-2 h-4 w-4" />
                New {kind === 'HEADER' ? 'Header' : 'Footer'}
              </button>
            </div>

            <div className="space-y-3">
              {groupedItems[kind].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => editItem(item)}
                  className="w-full rounded-2xl border border-gray-200 p-4 text-left transition hover:border-panda-primary"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.territory}</div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                      {item.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Territory Merge Values</h2>
            <p className="text-sm text-gray-500">These values power tokens like <code>{'{{territory.company_phone}}'}</code>.</p>
          </div>
          <button
            type="button"
            disabled={savingTerritoryProfiles}
            onClick={() => onSaveTerritoryProfiles(profilesDraft)}
            className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
          >
            <Save className="mr-2 h-4 w-4" />
            {savingTerritoryProfiles ? 'Saving...' : 'Save Territory Values'}
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {profilesDraft.map((profile, index) => (
            <div key={profile.id || profile.territory} className="rounded-2xl border border-gray-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">{profile.territory}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['company_name', 'Company Name'],
                  ['company_phone', 'Company Phone'],
                  ['company_address', 'Company Address'],
                  ['company_email', 'Company Email'],
                  ['company_license', 'Company License'],
                ].map(([key, label]) => (
                  <label key={key} className="block text-xs font-medium text-gray-600">
                    {label}
                    <input
                      value={profile[key] || ''}
                      onChange={(event) => {
                        const nextProfiles = [...profilesDraft];
                        nextProfiles[index] = { ...nextProfiles[index], [key]: event.target.value };
                        setProfilesDraft(nextProfiles);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
