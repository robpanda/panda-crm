import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, LayoutTemplate, Palette, Scale, Sparkles } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { agreementsApi } from '../../services/api';
import PandaSignTemplateList from '../../components/pandasign-v2/PandaSignTemplateList';
import PandaSignTemplateEditor from '../../components/pandasign-v2/PandaSignTemplateEditor';
import PandaSignBrandingManager from '../../components/pandasign-v2/PandaSignBrandingManager';
import PandaSignDynamicContentManager from '../../components/pandasign-v2/PandaSignDynamicContentManager';
import {
  DEFAULT_TEMPLATE_DRAFT,
  normalizeApiList,
  normalizeApiObject,
} from '../../components/pandasign-v2/pandasignV2AdminUtils';

const TAB_CONFIG = [
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'dynamic-content', label: 'Dynamic Content', icon: Sparkles },
];

const EMPTY_FILTERS = {
  q: '',
  documentType: '',
  territory: '',
  status: '',
};

export default function PandaSignV2() {
  const queryClient = useQueryClient();
  const editorRef = useRef(null);
  const [activeTab, setActiveTab] = useState('templates');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [notice, setNotice] = useState(null);
  const [publishingTemplateId, setPublishingTemplateId] = useState(null);
  const [archivingTemplateId, setArchivingTemplateId] = useState(null);

  const {
    data: templatesData,
    isLoading: loadingTemplates,
    error: templatesError,
  } = useQuery({
    queryKey: ['pandasign-v2-templates', filters],
    queryFn: () => agreementsApi.getTemplates(filters),
  });

  const {
    data: adminResourcesData,
    isLoading: loadingAdminResources,
    error: adminResourcesError,
  } = useQuery({
    queryKey: ['pandasign-v2-admin-resources'],
    queryFn: () => agreementsApi.getAdminResources(),
  });

  const templates = useMemo(() => normalizeApiList(templatesData), [templatesData]);
  const resources = useMemo(
    () => normalizeApiObject(adminResourcesData) || {
      brandingItems: [],
      dynamicContentItems: [],
      territoryProfiles: [],
      territories: [],
      documentTypes: [],
    },
    [adminResourcesData]
  );

  const createTemplateMutation = useMutation({
    mutationFn: agreementsApi.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-v2-templates'] });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }) => agreementsApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-v2-templates'] });
    },
  });

  const publishTemplateMutation = useMutation({
    mutationFn: agreementsApi.publishTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-v2-templates'] });
    },
  });

  const archiveTemplateMutation = useMutation({
    mutationFn: agreementsApi.archiveTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-v2-templates'] });
    },
  });

  const saveBrandingItemMutation = useMutation({
    mutationFn: (payload) => (
      payload.id
        ? agreementsApi.updateBrandingItem(payload.id, payload)
        : agreementsApi.createBrandingItem(payload)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-v2-admin-resources'] });
    },
  });

  const saveDynamicContentMutation = useMutation({
    mutationFn: (payload) => (
      payload.id
        ? agreementsApi.updateDynamicContentItem(payload.id, payload)
        : agreementsApi.createDynamicContentItem(payload)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-v2-admin-resources'] });
    },
  });

  const updateTerritoryProfilesMutation = useMutation({
    mutationFn: agreementsApi.updateTerritoryProfiles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-v2-admin-resources'] });
    },
  });

  const setSuccessNotice = (text) => setNotice({ type: 'success', text });
  const setErrorNotice = (error, fallback) => {
    const message =
      error?.response?.data?.error?.message
      || error?.response?.data?.message
      || error?.message
      || fallback;
    setNotice({ type: 'error', text: message });
  };

  const persistTemplate = async (payload) => {
    if (payload.id) {
      return updateTemplateMutation.mutateAsync({ id: payload.id, data: payload });
    }
    return createTemplateMutation.mutateAsync(payload);
  };

  const handleSaveTemplate = async (payload) => {
    try {
      const response = await persistTemplate(payload);
      const savedTemplate = normalizeApiObject(response);
      setEditingTemplate(savedTemplate || payload);
      setSuccessNotice('Template draft saved.');
    } catch (error) {
      setErrorNotice(error, 'Failed to save template draft.');
    }
  };

  const handlePublishTemplate = async (payloadOrTemplate) => {
    const draft = payloadOrTemplate || editingTemplate;
    if (!draft) return;

    try {
      const saveResponse = draft.id ? { data: draft } : await persistTemplate(draft);
      const savedTemplate = normalizeApiObject(saveResponse) || draft;
      setPublishingTemplateId(savedTemplate.id);
      const publishResponse = await publishTemplateMutation.mutateAsync(savedTemplate.id);
      setEditingTemplate(normalizeApiObject(publishResponse) || savedTemplate);
      setSuccessNotice('Template published.');
    } catch (error) {
      const details = error?.response?.data?.error?.details;
      if (Array.isArray(details) && details.length > 0) {
        setNotice({ type: 'error', text: details.join(' ') });
      } else {
        setErrorNotice(error, 'Failed to publish template.');
      }
    } finally {
      setPublishingTemplateId(null);
    }
  };

  const handleArchiveTemplate = async (template) => {
    try {
      setArchivingTemplateId(template.id);
      const response = await archiveTemplateMutation.mutateAsync(template.id);
      if (editingTemplate?.id === template.id) {
        setEditingTemplate(normalizeApiObject(response) || template);
      }
      setSuccessNotice('Template archived.');
    } catch (error) {
      setErrorNotice(error, 'Failed to archive template.');
    } finally {
      setArchivingTemplateId(null);
    }
  };

  const handleSaveBrandingItem = async (payload) => {
    try {
      await saveBrandingItemMutation.mutateAsync(payload);
      setSuccessNotice(`${payload.kind === 'FOOTER' ? 'Footer' : 'Header'} saved.`);
    } catch (error) {
      setErrorNotice(error, 'Failed to save branding asset.');
    }
  };

  const handleSaveDynamicContentItem = async (payload) => {
    try {
      await saveDynamicContentMutation.mutateAsync(payload);
      setSuccessNotice('Dynamic content block saved.');
    } catch (error) {
      setErrorNotice(error, 'Failed to save dynamic content block.');
    }
  };

  const handleSaveTerritoryProfiles = async (territoryProfiles) => {
    try {
      await updateTerritoryProfilesMutation.mutateAsync(territoryProfiles);
      setSuccessNotice('Territory merge values saved.');
    } catch (error) {
      setErrorNotice(error, 'Failed to save territory merge values.');
    }
  };

  const loading = loadingTemplates || loadingAdminResources;
  const pageError = templatesError || adminResourcesError;

  useEffect(() => {
    if (activeTab === 'templates' && editingTemplate && editorRef.current) {
      editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeTab, editingTemplate]);

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center rounded-full bg-panda-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-panda-primary">
                  PandaSign V2
                </div>
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900">Agreement Authoring</h1>
                  <p className="mt-2 max-w-3xl text-sm text-gray-600">
                    Create contract templates, manage reusable headers and footers, maintain territory merge values,
                    and define dynamic legal clauses for PandaSign V2.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <div className="flex items-center gap-2 font-medium text-gray-900">
                  <Scale className="h-4 w-4 text-panda-primary" />
                  Territory-aware publishing
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Templates require valid branding, signer roles, required fields, and body content before publish.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {TAB_CONFIG.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                      isActive
                        ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                        : 'border-gray-200 text-gray-700 hover:border-panda-primary hover:text-panda-primary'
                    }`}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {notice && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                notice.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {notice.text}
            </div>
          )}

          {loading && (
            <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500 shadow-sm">
              Loading PandaSign V2 admin resources...
            </div>
          )}

          {pageError && !loading && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
              Failed to load PandaSign V2 admin resources.
            </div>
          )}

          {!loading && !pageError && activeTab === 'templates' && (
            <div className="space-y-6">
              {editingTemplate && (
                <div ref={editorRef}>
                  <PandaSignTemplateEditor
                    template={editingTemplate}
                    resources={resources}
                    onClose={() => setEditingTemplate(null)}
                    onSave={handleSaveTemplate}
                    onPublish={handlePublishTemplate}
                    saving={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                    publishing={publishTemplateMutation.isPending}
                  />
                </div>
              )}

              <PandaSignTemplateList
                filters={filters}
                onFiltersChange={setFilters}
                templates={templates}
                onCreate={() => setEditingTemplate({ ...DEFAULT_TEMPLATE_DRAFT })}
                onEdit={setEditingTemplate}
                onPublish={handlePublishTemplate}
                onArchive={handleArchiveTemplate}
                isPublishingId={publishingTemplateId}
                isArchivingId={archivingTemplateId}
              />
            </div>
          )}

          {!loading && !pageError && activeTab === 'branding' && (
            <PandaSignBrandingManager
              brandingItems={normalizeApiList(resources.brandingItems)}
              territoryProfiles={normalizeApiList(resources.territoryProfiles)}
              dynamicContentItems={normalizeApiList(resources.dynamicContentItems)}
              onSaveBrandingItem={handleSaveBrandingItem}
              onSaveTerritoryProfiles={handleSaveTerritoryProfiles}
              savingBranding={saveBrandingItemMutation.isPending}
              savingTerritoryProfiles={updateTerritoryProfilesMutation.isPending}
            />
          )}

          {!loading && !pageError && activeTab === 'dynamic-content' && (
            <PandaSignDynamicContentManager
              dynamicContentItems={normalizeApiList(resources.dynamicContentItems)}
              onSaveDynamicContentItem={handleSaveDynamicContentItem}
              savingDynamicContent={saveDynamicContentMutation.isPending}
            />
          )}

          {!loading && !pageError && !editingTemplate && activeTab === 'templates' && (
            <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
              <FileSignature className="mx-auto h-10 w-10 text-gray-300" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900">Select a template or create a new draft</h2>
              <p className="mt-2 text-sm text-gray-500">
                Drafts, published templates, reusable branding assets, and dynamic legal content are managed from this screen.
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
