import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { agreementsApi } from '../../services/api';
import {
  AlertCircle,
  Bold,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit,
  Eye,
  FileText,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  Paintbrush,
  PenTool,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Underline,
  X,
  XCircle,
} from 'lucide-react';

const AGREEMENT_STATUSES = {
  DRAFT: { color: 'bg-gray-100 text-gray-700', icon: FileText, label: 'Draft' },
  SENT: { color: 'bg-blue-100 text-blue-700', icon: Send, label: 'Sent' },
  VIEWED: { color: 'bg-yellow-100 text-yellow-700', icon: Eye, label: 'Viewed' },
  SIGNED: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Signed' },
  VOIDED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Voided' },
  EXPIRED: { color: 'bg-orange-100 text-orange-700', icon: Clock, label: 'Expired' },
};

const MERGE_FIELDS = [
  '{{customerName}}',
  '{{recipientName}}',
  '{{recipientEmail}}',
  '{{jobId}}',
  '{{opportunityName}}',
  '{{accountName}}',
  '{{propertyAddress}}',
  '{{agentName}}',
  '{{todayDate}}',
  '{{agreementNumber}}',
];

const DEFAULT_TEMPLATE_DRAFT = {
  name: '',
  description: '',
  category: 'General',
  documentUrl: '',
  content: '<p></p>',
  isActive: true,
  brandingTemplateId: '',
};

const DEFAULT_BRANDING_DRAFT = {
  id: '',
  name: '',
  companyName: 'Panda Exteriors',
  logoUrl: '',
  primaryColor: '#f88000',
  secondaryColor: '#68a000',
  accentColor: '#1f2937',
  headerText: '',
  footerText: '',
  isDefault: false,
};

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractMergeFields(content) {
  const matches = String(content || '').match(/\{\{\s*[^}]+\s*\}\}/g) || [];
  return [...new Set(matches.map(match => match.replace(/[{}\s]/g, '')))]
    .filter(Boolean)
    .map(field => field.trim());
}

function stripBrandingWrapper(content) {
  return String(content || '')
    .replace(/<!--\s*PANDASIGN_BRANDING_START\s*-->[\s\S]*?<!--\s*PANDASIGN_BRANDING_END\s*-->/g, '')
    .trim();
}

function applyBrandingToHtml(content, branding) {
  const core = stripBrandingWrapper(content) || '<p></p>';
  const logoMarkup = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.companyName}" style="max-height:48px;max-width:220px;object-fit:contain;" />`
    : `<strong style="font-size:20px;color:${branding.primaryColor};">${branding.companyName}</strong>`;

  const headerText = branding.headerText
    ? `<div style="margin-top:8px;color:${branding.secondaryColor};font-size:13px;">${branding.headerText}</div>`
    : '';

  const footerText = branding.footerText
    ? `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;color:${branding.secondaryColor};font-size:12px;">${branding.footerText}</div>`
    : '';

  return `<!-- PANDASIGN_BRANDING_START -->
<div style="font-family:Arial,sans-serif;line-height:1.6;color:${branding.accentColor};">
  <div style="padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
    <div style="padding-bottom:12px;margin-bottom:16px;border-bottom:3px solid ${branding.primaryColor};">
      ${logoMarkup}
      ${headerText}
    </div>
    <div>
      ${core}
    </div>
    ${footerText}
  </div>
</div>
<!-- PANDASIGN_BRANDING_END -->`;
}

function toTemplateDraft(template) {
  return {
    name: template?.name || '',
    description: template?.description || '',
    category: template?.category || 'General',
    documentUrl: template?.documentUrl || template?.pdfTemplateUrl || '',
    content: template?.content || '<p></p>',
    isActive: template?.isActive !== false,
    brandingTemplateId: '',
  };
}

function StatusBadge({ status }) {
  const key = String(status || 'DRAFT').toUpperCase();
  const config = AGREEMENT_STATUSES[key] || AGREEMENT_STATUSES.DRAFT;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </span>
  );
}

function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);

  const executeCommand = (command, commandValue = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current.innerHTML);
  };

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML || '');
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-2 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-1 flex-wrap">
        <button type="button" onClick={() => executeCommand('bold')} className="p-1.5 hover:bg-white rounded" title="Bold">
          <Bold className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => executeCommand('italic')} className="p-1.5 hover:bg-white rounded" title="Italic">
          <Italic className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => executeCommand('underline')} className="p-1.5 hover:bg-white rounded" title="Underline">
          <Underline className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button type="button" onClick={() => executeCommand('insertUnorderedList')} className="p-1.5 hover:bg-white rounded" title="Bullet List">
          <List className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => executeCommand('insertOrderedList')} className="p-1.5 hover:bg-white rounded" title="Numbered List">
          <ListOrdered className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button
          type="button"
          onClick={() => {
            const url = prompt('Enter URL');
            if (url) executeCommand('createLink', url);
          }}
          className="p-1.5 hover:bg-white rounded"
          title="Insert Link"
        >
          <Link className="w-4 h-4" />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        dangerouslySetInnerHTML={{ __html: value || '' }}
        className="min-h-[260px] p-3 outline-none prose prose-sm max-w-none"
      />
    </div>
  );
}

function TemplateEditorModal({
  open,
  isSaving,
  draft,
  onChange,
  onClose,
  onSave,
  brandingTemplates,
  onApplyBranding,
}) {
  const [mode, setMode] = useState('wysiwyg');

  if (!open) return null;

  const handleInsertField = (field) => {
    const nextContent = `${draft.content || ''}<p>${field}</p>`;
    onChange({ ...draft, content: nextContent });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Agreement Template Editor</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
              <input
                value={draft.name}
                onChange={(e) => onChange({ ...draft, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Insurance Agreement"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input
                value={draft.category}
                onChange={(e) => onChange({ ...draft, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="General"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Template purpose and notes"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PDF Template URL (optional)</label>
            <input
              value={draft.documentUrl}
              onChange={(e) => onChange({ ...draft, documentUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="https://.../template.pdf"
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-medium text-gray-700">Branding Template</p>
              <button
                type="button"
                onClick={onApplyBranding}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-panda-primary text-white hover:bg-panda-primary/90"
              >
                Apply Branding
              </button>
            </div>
            <select
              value={draft.brandingTemplateId}
              onChange={(e) => onChange({ ...draft, brandingTemplateId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              <option value="">Select Branding Template</option>
              {brandingTemplates.map((branding) => (
                <option key={branding.id} value={branding.id}>
                  {branding.name}{branding.isDefault ? ' (Default)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('wysiwyg')}
                className={`px-3 py-1.5 rounded-md text-sm ${mode === 'wysiwyg' ? 'bg-panda-primary text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                WYSIWYG
              </button>
              <button
                type="button"
                onClick={() => setMode('html')}
                className={`px-3 py-1.5 rounded-md text-sm ${mode === 'html' ? 'bg-panda-primary text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                HTML
              </button>
            </div>
            <div className="text-xs text-gray-500">Merge fields auto-detected on save</div>
          </div>

          {mode === 'wysiwyg' ? (
            <RichTextEditor
              value={draft.content}
              onChange={(next) => onChange({ ...draft, content: next })}
            />
          ) : (
            <textarea
              value={draft.content}
              onChange={(e) => onChange({ ...draft, content: e.target.value })}
              rows={14}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
            />
          )}

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Merge Fields</p>
            <div className="flex flex-wrap gap-2">
              {MERGE_FIELDS.map((field) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => handleInsertField(field)}
                  className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700 hover:border-panda-primary"
                >
                  {field}
                </button>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => onChange({ ...draft, isActive: e.target.checked })}
              className="rounded border-gray-300"
            />
            Active template
          </label>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !draft.name.trim()}
            className="inline-flex items-center px-4 py-2 text-sm text-white bg-gradient-to-r from-panda-primary to-panda-secondary rounded-lg disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}

function BrandingEditorModal({ open, draft, onChange, onClose, onSave, isSaving }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Branding Template</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                value={draft.name}
                onChange={(e) => onChange({ ...draft, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                value={draft.companyName}
                onChange={(e) => onChange({ ...draft, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
            <input
              value={draft.logoUrl}
              onChange={(e) => onChange({ ...draft, logoUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
              <input
                type="color"
                value={draft.primaryColor}
                onChange={(e) => onChange({ ...draft, primaryColor: e.target.value })}
                className="w-full h-10 p-1 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
              <input
                type="color"
                value={draft.secondaryColor}
                onChange={(e) => onChange({ ...draft, secondaryColor: e.target.value })}
                className="w-full h-10 p-1 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
              <input
                type="color"
                value={draft.accentColor}
                onChange={(e) => onChange({ ...draft, accentColor: e.target.value })}
                className="w-full h-10 p-1 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Header Text</label>
            <input
              value={draft.headerText}
              onChange={(e) => onChange({ ...draft, headerText: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
            <textarea
              rows={3}
              value={draft.footerText}
              onChange={(e) => onChange({ ...draft, footerText: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => onChange({ ...draft, isDefault: e.target.checked })}
              className="rounded border-gray-300"
            />
            Set as default branding template
          </label>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !draft.name.trim()}
            className="inline-flex items-center px-4 py-2 text-sm text-white bg-gradient-to-r from-panda-primary to-panda-secondary rounded-lg disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Branding
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PandaSign() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('agreements');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');

  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateDraft, setTemplateDraft] = useState(DEFAULT_TEMPLATE_DRAFT);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);

  const [brandingEditorOpen, setBrandingEditorOpen] = useState(false);
  const [brandingDraft, setBrandingDraft] = useState(DEFAULT_BRANDING_DRAFT);

  const limit = 20;

  const agreementsQuery = useQuery({
    queryKey: ['pandasign-agreements', page, statusFilter],
    queryFn: () => agreementsApi.getAgreements({
      limit,
      offset: (page - 1) * limit,
      status: statusFilter || undefined,
    }),
    enabled: activeTab === 'agreements',
  });

  const templatesQuery = useQuery({
    queryKey: ['pandasign-templates'],
    queryFn: () => agreementsApi.getTemplates(),
    enabled: activeTab === 'templates',
  });

  const brandingQuery = useQuery({
    queryKey: ['pandasign-branding-templates'],
    queryFn: () => agreementsApi.getBrandingTemplates(),
    enabled: activeTab === 'branding' || templateEditorOpen,
  });

  const statsQuery = useQuery({
    queryKey: ['pandasign-stats'],
    queryFn: () => agreementsApi.getStats(),
  });

  const sendAgreementMutation = useMutation({
    mutationFn: (agreementId) => agreementsApi.sendAgreement(agreementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['pandasign-stats'] });
    },
    onError: (error) => {
      setErrorMessage(error?.response?.data?.error?.message || 'Failed to send agreement');
    },
  });

  const resendAgreementMutation = useMutation({
    mutationFn: (agreementId) => agreementsApi.resendAgreement(agreementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-agreements'] });
    },
    onError: (error) => {
      setErrorMessage(error?.response?.data?.error?.message || 'Failed to resend agreement');
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: ({ id, payload }) => (
      id ? agreementsApi.updateTemplate(id, payload) : agreementsApi.createTemplate(payload)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-templates'] });
      setTemplateEditorOpen(false);
      setEditingTemplateId(null);
      setTemplateDraft(DEFAULT_TEMPLATE_DRAFT);
    },
    onError: (error) => {
      setErrorMessage(error?.response?.data?.error?.message || 'Failed to save template');
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId) => agreementsApi.deleteTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-templates'] });
    },
    onError: (error) => {
      setErrorMessage(error?.response?.data?.error?.message || 'Failed to delete template');
    },
  });

  const saveBrandingMutation = useMutation({
    mutationFn: (templates) => agreementsApi.saveBrandingTemplates(templates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pandasign-branding-templates'] });
      setBrandingEditorOpen(false);
      setBrandingDraft(DEFAULT_BRANDING_DRAFT);
    },
    onError: (error) => {
      setErrorMessage(error?.response?.data?.error?.message || 'Failed to save branding templates');
    },
  });

  const agreementsRaw = agreementsQuery.data?.data || [];
  const templates = templatesQuery.data?.data || [];
  const brandingTemplates = brandingQuery.data?.data || [];
  const stats = statsQuery.data?.data || {
    total: 0,
    sent: 0,
    signed: 0,
    viewed: 0,
    draft: 0,
  };
  const pagination = agreementsQuery.data?.pagination || { total: 0 };

  const filteredAgreements = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return agreementsRaw;

    return agreementsRaw.filter((agreement) => {
      return (
        String(agreement?.name || '').toLowerCase().includes(term)
        || String(agreement?.recipientName || '').toLowerCase().includes(term)
        || String(agreement?.recipientEmail || '').toLowerCase().includes(term)
        || String(agreement?.agreementNumber || '').toLowerCase().includes(term)
      );
    });
  }, [agreementsRaw, searchTerm]);

  const filteredTemplates = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return templates;

    return templates.filter((template) => (
      String(template?.name || '').toLowerCase().includes(term)
      || String(template?.description || '').toLowerCase().includes(term)
      || String(template?.category || '').toLowerCase().includes(term)
    ));
  }, [templates, searchTerm]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / limit));

  const startNewTemplate = () => {
    setErrorMessage('');
    const defaultBranding = brandingTemplates.find(item => item.isDefault)?.id || '';
    setEditingTemplateId(null);
    setTemplateDraft({ ...DEFAULT_TEMPLATE_DRAFT, brandingTemplateId: defaultBranding });
    setTemplateEditorOpen(true);
  };

  const startEditTemplate = (template) => {
    setErrorMessage('');
    setEditingTemplateId(template.id);
    setTemplateDraft(toTemplateDraft(template));
    setTemplateEditorOpen(true);
  };

  const saveTemplate = () => {
    const content = String(templateDraft.content || '').trim();
    const payload = {
      name: templateDraft.name.trim(),
      description: templateDraft.description?.trim() || null,
      category: templateDraft.category?.trim() || 'General',
      content,
      documentUrl: templateDraft.documentUrl?.trim() || null,
      pdfTemplateUrl: templateDraft.documentUrl?.trim() || null,
      signatureFields: [],
      mergeFields: extractMergeFields(content),
      isActive: templateDraft.isActive !== false,
    };

    saveTemplateMutation.mutate({ id: editingTemplateId, payload });
  };

  const deleteTemplate = (templateId) => {
    if (!confirm('Delete this agreement template?')) return;
    deleteTemplateMutation.mutate(templateId);
  };

  const openNewBranding = () => {
    setErrorMessage('');
    setBrandingDraft({
      ...DEFAULT_BRANDING_DRAFT,
      id: `branding-${Date.now()}`,
      isDefault: brandingTemplates.length === 0,
    });
    setBrandingEditorOpen(true);
  };

  const openEditBranding = (branding) => {
    setErrorMessage('');
    setBrandingDraft({ ...DEFAULT_BRANDING_DRAFT, ...branding });
    setBrandingEditorOpen(true);
  };

  const saveBrandingDraft = () => {
    const current = [...brandingTemplates];
    const normalizedDraft = {
      ...brandingDraft,
      name: brandingDraft.name.trim(),
      companyName: brandingDraft.companyName.trim() || 'Panda Exteriors',
    };

    let next;
    const existingIndex = current.findIndex(item => item.id === normalizedDraft.id);
    if (existingIndex >= 0) {
      next = current.map(item => (item.id === normalizedDraft.id ? normalizedDraft : item));
    } else {
      next = [...current, normalizedDraft];
    }

    if (!next.some(item => item.isDefault)) {
      next = next.map((item, index) => ({ ...item, isDefault: index === 0 }));
    }

    if (normalizedDraft.isDefault) {
      next = next.map(item => ({ ...item, isDefault: item.id === normalizedDraft.id }));
    }

    saveBrandingMutation.mutate(next);
  };

  const deleteBranding = (brandingId) => {
    if (!confirm('Delete this branding template?')) return;

    const remaining = brandingTemplates.filter(item => item.id !== brandingId);
    if (remaining.length === 0) {
      setErrorMessage('At least one branding template is required.');
      return;
    }

    if (!remaining.some(item => item.isDefault)) {
      remaining[0].isDefault = true;
    }

    saveBrandingMutation.mutate(remaining);
  };

  const setDefaultBranding = (brandingId) => {
    const next = brandingTemplates.map(item => ({ ...item, isDefault: item.id === brandingId }));
    saveBrandingMutation.mutate(next);
  };

  const applyBrandingToTemplate = () => {
    const selectedBranding = brandingTemplates.find(item => item.id === templateDraft.brandingTemplateId)
      || brandingTemplates.find(item => item.isDefault);

    if (!selectedBranding) {
      setErrorMessage('Create a branding template first.');
      return;
    }

    const nextContent = applyBrandingToHtml(templateDraft.content, selectedBranding);
    setTemplateDraft(prev => ({
      ...prev,
      brandingTemplateId: selectedBranding.id,
      content: nextContent,
    }));
  };

  const tabButtonClass = (tab) => (
    `px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
        : 'text-gray-600 hover:bg-gray-100'
    }`
  );

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <PenTool className="w-7 h-7 mr-3 text-panda-primary" />
              PandaSign
            </h1>
            <p className="text-gray-500 mt-1">Manage agreements, WYSIWYG templates, and branding presets</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setErrorMessage('');
                if (activeTab === 'agreements') queryClient.invalidateQueries({ queryKey: ['pandasign-agreements'] });
                if (activeTab === 'templates') queryClient.invalidateQueries({ queryKey: ['pandasign-templates'] });
                if (activeTab === 'branding') queryClient.invalidateQueries({ queryKey: ['pandasign-branding-templates'] });
                queryClient.invalidateQueries({ queryKey: ['pandasign-stats'] });
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </button>

            {activeTab === 'templates' && (
              <button
                onClick={startNewTemplate}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white text-sm font-medium rounded-lg hover:opacity-90"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </button>
            )}

            {activeTab === 'branding' && (
              <button
                onClick={openNewBranding}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white text-sm font-medium rounded-lg hover:opacity-90"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Branding
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard icon={FileText} label="Total Agreements" value={stats.total} color="bg-gray-100 text-gray-600" />
          <StatCard icon={Send} label="Sent" value={stats.sent} color="bg-blue-100 text-blue-600" />
          <StatCard icon={Eye} label="Viewed" value={stats.viewed} color="bg-yellow-100 text-yellow-600" />
          <StatCard icon={CheckCircle} label="Signed" value={stats.signed} color="bg-green-100 text-green-600" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-100">
            <div className="flex gap-1 p-1">
              <button onClick={() => setActiveTab('agreements')} className={tabButtonClass('agreements')}>
                <FileText className="w-4 h-4 inline mr-2" />
                Agreements
              </button>
              <button onClick={() => setActiveTab('templates')} className={tabButtonClass('templates')}>
                <Copy className="w-4 h-4 inline mr-2" />
                Templates
              </button>
              <button onClick={() => setActiveTab('branding')} className={tabButtonClass('branding')}>
                <Paintbrush className="w-4 h-4 inline mr-2" />
                Branding Templates
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={activeTab === 'agreements' ? 'Search agreements...' : 'Search templates...'}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          {activeTab === 'agreements' && (
            <>
              <div className="p-4 border-b border-gray-100">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
                >
                  <option value="">All Statuses</option>
                  {Object.keys(AGREEMENT_STATUSES).map((status) => (
                    <option key={status} value={status}>{AGREEMENT_STATUSES[status].label}</option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agreement</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {agreementsQuery.isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center">
                          <Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" />
                        </td>
                      </tr>
                    ) : filteredAgreements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No agreements found</td>
                      </tr>
                    ) : (
                      filteredAgreements.map((agreement) => {
                        const canSend = String(agreement.status || '').toUpperCase() === 'DRAFT';
                        const canResend = ['SENT', 'VIEWED'].includes(String(agreement.status || '').toUpperCase());
                        const openUrl = agreement.signedDocumentUrl || agreement.documentUrl;

                        return (
                          <tr key={agreement.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4">
                              <p className="font-medium text-gray-900">{agreement.name || 'Untitled Agreement'}</p>
                              <p className="text-xs text-gray-500">{agreement.agreementNumber || agreement.id}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-medium text-gray-900">{agreement.recipientName || '-'}</p>
                              <p className="text-sm text-gray-500">{agreement.recipientEmail || '-'}</p>
                            </td>
                            <td className="px-4 py-4">
                              <StatusBadge status={agreement.status} />
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500">
                              {formatDateTime(agreement.updatedAt || agreement.sentAt || agreement.createdAt)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1">
                                {openUrl && (
                                  <a
                                    href={openUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                                    title="View document"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </a>
                                )}

                                {canSend && (
                                  <button
                                    onClick={() => sendAgreementMutation.mutate(agreement.id)}
                                    disabled={sendAgreementMutation.isPending}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40"
                                    title="Send"
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                )}

                                {canResend && (
                                  <button
                                    onClick={() => resendAgreementMutation.mutate(agreement.id)}
                                    disabled={resendAgreementMutation.isPending}
                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded disabled:opacity-40"
                                    title="Resend"
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(current => Math.max(1, current - 1))}
                      disabled={page <= 1}
                      className="p-2 border border-gray-200 rounded-lg disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                      disabled={page >= totalPages}
                      className="p-2 border border-gray-200 rounded-lg disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'templates' && (
            <div className="p-4 sm:p-6">
              {templatesQuery.isLoading ? (
                <div className="py-12 text-center text-gray-500">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                  Loading templates...
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  <Copy className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  No templates found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredTemplates.map((template) => (
                    <div key={template.id} className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">{template.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{template.category || 'General'}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${template.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {template.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                        {(template.content || '').replace(/<[^>]*>/g, ' ').trim() || 'No content'}
                      </p>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEditTemplate(template)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit template"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          title="Delete template"
                          disabled={deleteTemplateMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="p-4 sm:p-6">
              {brandingQuery.isLoading ? (
                <div className="py-12 text-center text-gray-500">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                  Loading branding templates...
                </div>
              ) : brandingTemplates.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  <Paintbrush className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  No branding templates yet
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {brandingTemplates.map((branding) => (
                    <div key={branding.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{branding.name}</h3>
                          <p className="text-xs text-gray-500">{branding.companyName}</p>
                        </div>
                        {branding.isDefault && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Default</span>
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <ColorSwatch color={branding.primaryColor} label="Primary" />
                          <ColorSwatch color={branding.secondaryColor} label="Secondary" />
                          <ColorSwatch color={branding.accentColor} label="Accent" />
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2">{branding.headerText || 'No header text'}</p>
                        <div className="flex items-center justify-end gap-1 pt-1">
                          {!branding.isDefault && (
                            <button
                              onClick={() => setDefaultBranding(branding.id)}
                              className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            onClick={() => openEditBranding(branding)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit branding"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteBranding(branding.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            title="Delete branding"
                            disabled={saveBrandingMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <TemplateEditorModal
        open={templateEditorOpen}
        draft={templateDraft}
        onChange={setTemplateDraft}
        onClose={() => {
          setTemplateEditorOpen(false);
          setEditingTemplateId(null);
          setTemplateDraft(DEFAULT_TEMPLATE_DRAFT);
        }}
        onSave={saveTemplate}
        isSaving={saveTemplateMutation.isPending}
        brandingTemplates={brandingTemplates}
        onApplyBranding={applyBrandingToTemplate}
      />

      <BrandingEditorModal
        open={brandingEditorOpen}
        draft={brandingDraft}
        onChange={setBrandingDraft}
        onClose={() => {
          setBrandingEditorOpen(false);
          setBrandingDraft(DEFAULT_BRANDING_DRAFT);
        }}
        onSave={saveBrandingDraft}
        isSaving={saveBrandingMutation.isPending}
      />
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function ColorSwatch({ color, label }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className="w-4 h-4 rounded border border-gray-200" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}
