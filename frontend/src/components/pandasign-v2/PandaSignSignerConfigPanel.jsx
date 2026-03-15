import { Plus, Trash2 } from 'lucide-react';
import { DEFAULT_REQUIRED_FIELD_TYPES } from './pandasignV2AdminUtils';

export default function PandaSignSignerConfigPanel({
  signerRoles,
  requiredFieldsConfig,
  onSignerRolesChange,
  onRequiredFieldsChange,
}) {
  const addSignerRole = () => {
    const nextIndex = signerRoles.length + 1;
    onSignerRolesChange([
      ...signerRoles,
      {
        id: `signer-role-${Date.now()}`,
        role: `SIGNER_${nextIndex}`,
        label: `Signer ${nextIndex}`,
        required: true,
        order: nextIndex,
      },
    ]);
  };

  const updateSignerRole = (index, updates) => {
    onSignerRolesChange(
      signerRoles.map((role, roleIndex) => (
        roleIndex === index ? { ...role, ...updates } : role
      ))
    );
  };

  const removeSignerRole = (index) => {
    onSignerRolesChange(signerRoles.filter((_, roleIndex) => roleIndex !== index));
    onRequiredFieldsChange(
      requiredFieldsConfig.filter((field) => field.role !== signerRoles[index]?.role)
    );
  };

  const addRequiredField = () => {
    const fallbackRole = signerRoles[0]?.role || 'CUSTOMER';
    onRequiredFieldsChange([
      ...requiredFieldsConfig,
      {
        id: `required-field-${Date.now()}`,
        role: fallbackRole,
        type: 'TEXT',
        label: '',
        required: true,
      },
    ]);
  };

  const updateRequiredField = (index, updates) => {
    onRequiredFieldsChange(
      requiredFieldsConfig.map((field, fieldIndex) => (
        fieldIndex === index ? { ...field, ...updates } : field
      ))
    );
  };

  const removeRequiredField = (index) => {
    onRequiredFieldsChange(requiredFieldsConfig.filter((_, fieldIndex) => fieldIndex !== index));
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Signer Roles</h3>
            <p className="text-xs text-gray-500">Define who signs and in what order.</p>
          </div>
          <button
            type="button"
            onClick={addSignerRole}
            className="inline-flex items-center rounded-lg bg-panda-primary px-3 py-2 text-xs font-semibold text-white hover:bg-panda-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Signer
          </button>
        </div>

        <div className="space-y-3">
          {signerRoles.map((signer, index) => (
            <div key={signer.id || signer.role} className="rounded-xl border border-gray-200 p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
                <label className="block text-xs font-medium text-gray-600">
                  Role Key
                  <input
                    value={signer.role}
                    onChange={(event) => updateSignerRole(index, { role: event.target.value.toUpperCase() })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  Label
                  <input
                    value={signer.label}
                    onChange={(event) => updateSignerRole(index, { label: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                  <input
                    type="checkbox"
                    checked={signer.required !== false}
                    onChange={(event) => updateSignerRole(index, { required: event.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => removeSignerRole(index)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 px-3 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Required Fields</h3>
            <p className="text-xs text-gray-500">Fields that must be resolved before publish or send.</p>
          </div>
          <button
            type="button"
            onClick={addRequiredField}
            className="inline-flex items-center rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Field
          </button>
        </div>

        <div className="space-y-3">
          {requiredFieldsConfig.map((field, index) => (
            <div key={field.id} className="rounded-xl border border-gray-200 p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto] md:items-end">
                <label className="block text-xs font-medium text-gray-600">
                  Label
                  <input
                    value={field.label}
                    onChange={(event) => updateRequiredField(index, { label: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  Role
                  <select
                    value={field.role}
                    onChange={(event) => updateRequiredField(index, { role: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {signerRoles.map((signer) => (
                      <option key={signer.role} value={signer.role}>
                        {signer.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  Type
                  <select
                    value={field.type}
                    onChange={(event) => updateRequiredField(index, { type: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {DEFAULT_REQUIRED_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                  <input
                    type="checkbox"
                    checked={field.required !== false}
                    onChange={(event) => updateRequiredField(index, { required: event.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => removeRequiredField(index)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 px-3 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {requiredFieldsConfig.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              No required fields configured yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
