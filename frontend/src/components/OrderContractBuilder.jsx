import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  FileSignature,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { opportunitiesApi } from '../services/api';

const DOCUMENT_TYPE_OPTIONS = ['CONTRACT', 'CHANGE_ORDER', 'WORK_ORDER', 'FINANCING', 'OTHER'];
const TERRITORY_OPTIONS = ['DE', 'MD', 'NJ', 'PA', 'NC', 'VA', 'FL', 'DEFAULT'];

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
}

function deepCloneJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function deepMergeJson(baseValue, patchValue) {
  if (patchValue === undefined) {
    return deepCloneJson(baseValue, baseValue);
  }

  if (Array.isArray(patchValue)) {
    return deepCloneJson(patchValue, []);
  }

  if (!isPlainObject(patchValue)) {
    return patchValue;
  }

  const baseObject = isPlainObject(baseValue) ? baseValue : {};
  const result = { ...deepCloneJson(baseObject, {}) };

  Object.entries(patchValue).forEach(([key, value]) => {
    if (value === undefined) return;

    if (Array.isArray(value)) {
      result[key] = deepCloneJson(value, []);
      return;
    }

    if (isPlainObject(value)) {
      result[key] = deepMergeJson(baseObject[key], value);
      return;
    }

    result[key] = value;
  });

  return result;
}

function pickFirstText(...values) {
  const flattened = values.flatMap((value) => (Array.isArray(value) ? value : [value]));
  for (const value of flattened) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function buildFullName(...values) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function toDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function createLineItem() {
  return {
    id: `line-item-${Math.random().toString(36).slice(2, 10)}`,
    name: '',
    description: '',
    quantity: '1',
    unitPrice: '',
    total: '',
  };
}

function createSigner(defaults = {}) {
  return {
    name: '',
    email: '',
    phone: '',
    title: '',
    role: '',
    label: '',
    required: true,
    ...defaults,
  };
}

function normalizeAdditionalSigners(signers = []) {
  if (!Array.isArray(signers)) return [];
  return signers.map((signer, index) => ({
    id: signer.id || `additional-signer-${index + 1}`,
    ...createSigner(),
    ...signer,
  }));
}

function buildDefaultDraft({ opportunity, account, contact }) {
  const owner = opportunity?.owner || {};
  const customerName = pickFirstText(
    contact?.fullName,
    buildFullName(contact?.firstName, contact?.lastName),
    account?.name
  );
  const customerEmail = pickFirstText(contact?.email, account?.email);
  const customerPhone = pickFirstText(contact?.mobilePhone, contact?.phone, account?.phone);
  const salesRepName = pickFirstText(owner?.fullName, owner?.name, buildFullName(owner?.firstName, owner?.lastName));
  const salesRepEmail = pickFirstText(owner?.email);
  const salesRepPhone = pickFirstText(owner?.phone, owner?.mobilePhone);
  const salesRepTitle = pickFirstText(owner?.title, 'Sales Representative');
  const projectAddress = pickFirstText(
    [opportunity?.street, opportunity?.city, opportunity?.state, opportunity?.postalCode]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ')
  );

  return {
    overview: {
      documentType: 'CONTRACT',
      territory: pickFirstText(opportunity?.state, account?.billingState, contact?.mailingState, 'DEFAULT'),
      projectName: pickFirstText(opportunity?.name),
      jobNumber: pickFirstText(opportunity?.jobId),
      projectAddress,
      contractDate: '',
      effectiveDate: '',
      customerName,
      customerEmail,
      customerPhone,
      salesRepName,
      salesRepEmail,
      salesRepPhone,
      salesRepTitle,
      notes: '',
    },
    pricing: {
      contractAmount: opportunity?.contractTotal ?? opportunity?.amount ?? '',
      depositAmount: '',
      financedAmount: '',
      scopeOfWork: '',
      lineItems: [],
    },
    signers: {
      customer: createSigner({
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        role: 'CUSTOMER',
        label: 'Customer',
        required: true,
      }),
      agent: createSigner({
        name: salesRepName,
        email: salesRepEmail,
        phone: salesRepPhone,
        title: salesRepTitle,
        role: 'AGENT',
        label: 'Agent',
        required: true,
      }),
      additional: [],
    },
  };
}

function hydrateDraft(defaultDraft, storedOrderContract) {
  const merged = deepMergeJson(defaultDraft, storedOrderContract || {});
  return {
    ...merged,
    pricing: {
      ...merged.pricing,
      lineItems: Array.isArray(merged.pricing?.lineItems)
        ? merged.pricing.lineItems.map((item) => ({
            id: item.id || `line-item-${Math.random().toString(36).slice(2, 10)}`,
            name: item.name || '',
            description: item.description || '',
            quantity: item.quantity ?? '',
            unitPrice: item.unitPrice ?? '',
            total: item.total ?? '',
          }))
        : [],
    },
    signers: {
      customer: { ...createSigner({ role: 'CUSTOMER', label: 'Customer', required: true }), ...(merged.signers?.customer || {}) },
      agent: { ...createSigner({ role: 'AGENT', label: 'Agent', required: true }), ...(merged.signers?.agent || {}) },
      additional: normalizeAdditionalSigners(merged.signers?.additional),
    },
  };
}

function normalizeNumberish(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : value;
}

function sanitizeLineItems(lineItems = []) {
  return lineItems
    .map((item) => ({
      id: item.id,
      name: String(item.name || '').trim(),
      description: String(item.description || '').trim(),
      quantity: normalizeNumberish(item.quantity),
      unitPrice: normalizeNumberish(item.unitPrice),
      total: normalizeNumberish(item.total),
    }))
    .filter((item) => item.name || item.description || item.quantity !== null || item.unitPrice !== null || item.total !== null);
}

function sanitizeSigner(signer = {}) {
  return {
    name: String(signer.name || '').trim(),
    email: String(signer.email || '').trim(),
    phone: String(signer.phone || '').trim(),
    title: String(signer.title || '').trim(),
    role: String(signer.role || '').trim(),
    label: String(signer.label || '').trim(),
    required: signer.required !== false,
  };
}

function buildSectionPayload(sectionKey, draft) {
  if (sectionKey === 'overview') {
    return {
      overview: {
        ...draft.overview,
      },
    };
  }

  if (sectionKey === 'pricing') {
    return {
      pricing: {
        contractAmount: normalizeNumberish(draft.pricing.contractAmount),
        depositAmount: normalizeNumberish(draft.pricing.depositAmount),
        financedAmount: normalizeNumberish(draft.pricing.financedAmount),
        scopeOfWork: String(draft.pricing.scopeOfWork || ''),
        lineItems: sanitizeLineItems(draft.pricing.lineItems),
      },
    };
  }

  return {
    signers: {
      customer: sanitizeSigner(draft.signers.customer),
      agent: sanitizeSigner(draft.signers.agent),
      additional: draft.signers.additional
        .map(sanitizeSigner)
        .filter((signer) => Object.values(signer).some((value) => value === true || value === false || String(value || '').trim())),
    },
  };
}

export default function OrderContractBuilder({
  opportunity,
  account,
  contact,
  onLaunchPandaSign,
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => buildDefaultDraft({ opportunity, account, contact }));
  const [hasHydrated, setHasHydrated] = useState(false);
  const [activeSaveSection, setActiveSaveSection] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const orderContractQuery = useQuery({
    queryKey: ['opportunityOrderContract', opportunity?.id],
    enabled: Boolean(opportunity?.id),
    queryFn: () => opportunitiesApi.getOrderContract(opportunity.id),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setDraft(buildDefaultDraft({ opportunity, account, contact }));
    setHasHydrated(false);
    setActiveSaveSection('');
    setFeedback({ type: '', message: '' });
  }, [opportunity?.id, account?.id, contact?.id]);

  useEffect(() => {
    if (!orderContractQuery.data || hasHydrated) return;
    const nextDraft = hydrateDraft(
      buildDefaultDraft({ opportunity, account, contact }),
      orderContractQuery.data.orderContract
    );
    setDraft(nextDraft);
    setHasHydrated(true);
  }, [orderContractQuery.data, hasHydrated, opportunity, account, contact]);

  const saveMutation = useMutation({
    mutationFn: async ({ sectionKey, payload }) => {
      return opportunitiesApi.updateOrderContract(opportunity.id, payload);
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['opportunityOrderContract', opportunity.id], data);
      const returnedSection = data?.orderContract?.[variables.sectionKey] || {};
      setDraft((currentDraft) => {
        if (variables.sectionKey === 'signers') {
          return {
            ...currentDraft,
            signers: hydrateDraft(
              buildDefaultDraft({ opportunity, account, contact }),
              { signers: returnedSection }
            ).signers,
          };
        }

        if (variables.sectionKey === 'pricing') {
          return {
            ...currentDraft,
            pricing: hydrateDraft(
              buildDefaultDraft({ opportunity, account, contact }),
              { pricing: returnedSection }
            ).pricing,
          };
        }

        return {
          ...currentDraft,
          overview: {
            ...currentDraft.overview,
            ...returnedSection,
          },
        };
      });
      setActiveSaveSection('');
      setFeedback({
        type: 'success',
        message: `${variables.sectionKey.charAt(0).toUpperCase()}${variables.sectionKey.slice(1)} saved to specsData.orderContract`,
      });
    },
    onError: (error) => {
      setActiveSaveSection('');
      setFeedback({
        type: 'error',
        message: error?.response?.data?.error?.message || error?.message || 'Unable to save contract data right now.',
      });
    },
  });

  function saveSection(sectionKey) {
    setActiveSaveSection(sectionKey);
    setFeedback({ type: '', message: '' });
    saveMutation.mutate({
      sectionKey,
      payload: buildSectionPayload(sectionKey, draft),
    });
  }

  function updateOverview(field, value) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      overview: {
        ...currentDraft.overview,
        [field]: value,
      },
    }));
  }

  function updatePricing(field, value) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      pricing: {
        ...currentDraft.pricing,
        [field]: value,
      },
    }));
  }

  function updateLineItem(index, field, value) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      pricing: {
        ...currentDraft.pricing,
        lineItems: currentDraft.pricing.lineItems.map((item, itemIndex) => (
          itemIndex === index
            ? { ...item, [field]: value }
            : item
        )),
      },
    }));
  }

  function addLineItem() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      pricing: {
        ...currentDraft.pricing,
        lineItems: [...currentDraft.pricing.lineItems, createLineItem()],
      },
    }));
  }

  function removeLineItem(index) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      pricing: {
        ...currentDraft.pricing,
        lineItems: currentDraft.pricing.lineItems.filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  }

  function updateSigner(group, field, value, index = null) {
    setDraft((currentDraft) => {
      if (group === 'additional') {
        return {
          ...currentDraft,
          signers: {
            ...currentDraft.signers,
            additional: currentDraft.signers.additional.map((signer, signerIndex) => (
              signerIndex === index
                ? { ...signer, [field]: value }
                : signer
            )),
          },
        };
      }

      return {
        ...currentDraft,
        signers: {
          ...currentDraft.signers,
          [group]: {
            ...currentDraft.signers[group],
            [field]: value,
          },
        },
      };
    });
  }

  function addAdditionalSigner() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      signers: {
        ...currentDraft.signers,
        additional: [
          ...currentDraft.signers.additional,
          createSigner({ role: 'ADDITIONAL', label: 'Additional Signer', required: false }),
        ],
      },
    }));
  }

  function removeAdditionalSigner(index) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      signers: {
        ...currentDraft.signers,
        additional: currentDraft.signers.additional.filter((_, signerIndex) => signerIndex !== index),
      },
    }));
  }

  if (!opportunity?.id) {
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-indigo-700">
            <FileSignature className="h-5 w-5" />
            <h3 className="text-lg font-semibold text-gray-900">Order Builder (Phase 1)</h3>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Save structured contract data for PandaSign V2. Each section patches only its own `orderContract`
            branch and preserves unrelated job specs data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {orderContractQuery.isFetching && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading saved contract data...
            </span>
          )}
          <button
            type="button"
            onClick={() => onLaunchPandaSign?.()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
          >
            <FileSignature className="h-4 w-4" />
            Launch PandaSign V2
          </button>
        </div>
      </div>

      {feedback.message && (
        <div className={`mx-5 mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
          feedback.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {orderContractQuery.error && !hasHydrated && (
        <div className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Unable to load existing order-contract data. You can still enter values, but I would refresh this job once the API is reachable.
        </div>
      )}

      <div className="space-y-6 p-5">
        <section className="rounded-2xl border border-gray-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-gray-900">Overview</h4>
              <p className="text-sm text-gray-500">High-level contract, customer, territory, and sales information.</p>
            </div>
            <button
              type="button"
              onClick={() => saveSection('overview')}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeSaveSection === 'overview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Overview
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Document Type</span>
              <select
                value={draft.overview.documentType}
                onChange={(event) => updateOverview('documentType', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              >
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Territory</span>
              <select
                value={draft.overview.territory}
                onChange={(event) => updateOverview('territory', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              >
                {TERRITORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            {[
              ['projectName', 'Project Name'],
              ['jobNumber', 'Job Number'],
              ['projectAddress', 'Project Address'],
              ['contractDate', 'Contract Date', 'date'],
              ['effectiveDate', 'Effective Date', 'date'],
              ['customerName', 'Customer Name'],
              ['customerEmail', 'Customer Email', 'email'],
              ['customerPhone', 'Customer Phone'],
              ['salesRepName', 'Sales Rep Name'],
              ['salesRepEmail', 'Sales Rep Email', 'email'],
              ['salesRepPhone', 'Sales Rep Phone'],
              ['salesRepTitle', 'Sales Rep Title'],
            ].map(([field, label, type]) => (
              <label key={field} className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
                <input
                  type={type || 'text'}
                  value={draft.overview[field]}
                  onChange={(event) => updateOverview(field, event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                />
              </label>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Notes</span>
            <textarea
              value={draft.overview.notes}
              onChange={(event) => updateOverview('notes', event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
            />
          </label>
        </section>

        <section className="rounded-2xl border border-gray-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-gray-900">Pricing</h4>
              <p className="text-sm text-gray-500">Contract financials, scope of work, and contract line items.</p>
            </div>
            <button
              type="button"
              onClick={() => saveSection('pricing')}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeSaveSection === 'pricing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Pricing
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['contractAmount', 'Contract Amount'],
              ['depositAmount', 'Deposit Amount'],
              ['financedAmount', 'Financed Amount'],
            ].map(([field, label]) => (
              <label key={field} className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
                <input
                  type="number"
                  step="0.01"
                  value={draft.pricing[field]}
                  onChange={(event) => updatePricing(field, event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                />
              </label>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Scope of Work</span>
            <textarea
              value={draft.pricing.scopeOfWork}
              onChange={(event) => updatePricing('scopeOfWork', event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
            />
          </label>

          <div className="mt-4 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h5 className="text-sm font-semibold text-gray-900">Line Items</h5>
                <p className="text-xs text-gray-500">These items feed PandaSign pricing merge data.</p>
              </div>
              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
              >
                <Plus className="h-4 w-4" />
                Add Line Item
              </button>
            </div>

            <div className="space-y-4 p-4">
              {draft.pricing.lineItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                  No line items yet. Add contract items here and save Pricing to feed PandaSign.
                </div>
              )}

              {draft.pricing.lineItems.map((item, index) => (
                <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h6 className="text-sm font-semibold text-gray-900">Line Item {index + 1}</h6>
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block xl:col-span-2">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(event) => updateLineItem(index, 'name', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Quantity</span>
                      <input
                        type="number"
                        step="1"
                        value={item.quantity}
                        onChange={(event) => updateLineItem(index, 'quantity', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Unit Price</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) => updateLineItem(index, 'unitPrice', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                      />
                    </label>
                    <label className="block xl:col-span-3">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Description</span>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(event) => updateLineItem(index, 'description', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Total</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.total}
                        onChange={(event) => updateLineItem(index, 'total', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-gray-900">Signers</h4>
              <p className="text-sm text-gray-500">Customer, agent, and any additional signers needed by PandaSign.</p>
            </div>
            <button
              type="button"
              onClick={() => saveSection('signers')}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeSaveSection === 'signers' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Signers
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {[
              ['customer', 'Customer Signer'],
              ['agent', 'Agent Signer'],
            ].map(([group, label]) => (
              <div key={group} className="rounded-xl border border-gray-200 p-4">
                <h5 className="mb-3 text-sm font-semibold text-gray-900">{label}</h5>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ['name', 'Name'],
                    ['email', 'Email', 'email'],
                    ['phone', 'Phone'],
                    ['title', 'Title'],
                    ['role', 'Role'],
                    ['label', 'Label'],
                  ].map(([field, fieldLabel, type]) => (
                    <label key={field} className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">{fieldLabel}</span>
                      <input
                        type={type || 'text'}
                        value={draft.signers[group][field]}
                        onChange={(event) => updateSigner(group, field, event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h5 className="text-sm font-semibold text-gray-900">Additional Signers</h5>
                <p className="text-xs text-gray-500">Use this only when the contract needs more than the customer and agent.</p>
              </div>
              <button
                type="button"
                onClick={addAdditionalSigner}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
              >
                <Plus className="h-4 w-4" />
                Add Signer
              </button>
            </div>

            <div className="space-y-4 p-4">
              {draft.signers.additional.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                  No additional signers yet.
                </div>
              )}

              {draft.signers.additional.map((signer, index) => (
                <div key={signer.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h6 className="text-sm font-semibold text-gray-900">Additional Signer {index + 1}</h6>
                    <button
                      type="button"
                      onClick={() => removeAdditionalSigner(index)}
                      className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      ['name', 'Name'],
                      ['email', 'Email', 'email'],
                      ['phone', 'Phone'],
                      ['title', 'Title'],
                      ['role', 'Role'],
                      ['label', 'Label'],
                    ].map(([field, fieldLabel, type]) => (
                      <label key={field} className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">{fieldLabel}</span>
                        <input
                          type={type || 'text'}
                          value={signer[field]}
                          onChange={(event) => updateSigner('additional', field, event.target.value, index)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-900">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" />
            <div>
              <p className="font-medium">Phase 1 builder saves iteratively.</p>
              <p className="text-indigo-700">
                Save Overview, Pricing, and Signers independently. Each save patches only that section and leaves unrelated specs data intact.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onLaunchPandaSign?.()}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 font-medium text-indigo-700 hover:border-indigo-300"
          >
            <FileSignature className="h-4 w-4" />
            Open PandaSign
          </button>
        </div>
      </div>
    </div>
  );
}
