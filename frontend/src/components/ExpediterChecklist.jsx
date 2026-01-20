import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { opportunitiesApi } from '../services/api';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Camera,
  Home,
  Zap,
  FileText,
  FileCheck,
  UserCheck,
  Calendar,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
} from 'lucide-react';

// Onboarding verification fields (migrated from Salesforce Project Expediting)
const ONBOARDING_VERIFICATION = [
  { id: 'hoaRequired', label: 'HOA Required', icon: Home, type: 'select', options: [
    { value: '', label: 'Select...' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'unknown', label: 'Unknown' },
  ]},
  { id: 'hoaApproved', label: 'HOA Approved', icon: CheckCircle, type: 'checkbox', conditionalOn: 'hoaRequired', conditionalValue: 'yes' },
  { id: 'permitRequired', label: 'Permit Required', icon: FileCheck, type: 'checkbox' },
  { id: 'permitObtained', label: 'Permit Obtained', icon: CheckCircle, type: 'checkbox', conditionalOn: 'permitRequired', conditionalValue: true },
  { id: 'piiComplete', label: 'PII Complete', icon: UserCheck, type: 'checkbox' },
  { id: 'changeOrderSigned', label: 'Change Order Signed', icon: FileText, type: 'checkbox' },
  { id: 'solarDnrRequired', label: 'Solar DNR Required', icon: Zap, type: 'checkbox' },
];

// Job complexity review fields
const JOB_COMPLEXITY = [
  { id: 'jobComplexityPhotosReviewed', label: 'Job Complexity Photos Reviewed', icon: Camera, type: 'checkbox' },
  { id: 'jobComplexityNotes', label: 'Job Complexity Notes', icon: FileText, type: 'textarea' },
  { id: 'flatRoof', label: 'Flat Roof', icon: Home, type: 'toggle',
    triggerWarning: 'Setting this to Yes will create a case for Trevor (Flat Roof Review)' },
  { id: 'lineDrop', label: 'Line Drop Required', icon: Zap, type: 'toggle',
    triggerWarning: 'Setting this to Yes will create a case for Kevin Flores and send an SMS to the homeowner explaining the line drop process' },
];

// Supplement and install ready fields
const SUPPLEMENT_FIELDS = [
  { id: 'supplementRequired', label: 'Supplement Required', icon: FileText, type: 'checkbox' },
  { id: 'supplementHoldsJob', label: 'Supplement Holds Job', icon: AlertTriangle, type: 'checkbox',
    conditionalOn: 'supplementRequired', conditionalValue: true,
    helpText: 'If checked, job will be set to Not Install Ready' },
];

// Install ready override
const INSTALL_READY_FIELDS = [
  { id: 'notInstallReady', label: 'Not Install Ready', icon: AlertCircle, type: 'checkbox' },
  { id: 'notInstallReadyNotes', label: 'Not Install Ready Notes', icon: FileText, type: 'textarea', conditionalOn: 'notInstallReady', conditionalValue: true },
  { id: 'vetoInstallNotReady', label: 'Veto Install Not Ready (Override)', icon: CheckCircle, type: 'checkbox',
    helpText: 'Override the Not Install Ready flag if you have addressed all concerns' },
];

// Project expeditor fields
const EXPEDITOR_FIELDS = [
  { id: 'projectExpeditorNotes', label: 'Project Expeditor Notes', icon: FileText, type: 'textarea' },
];

export default function ExpediterChecklist({ opportunity, onUpdate }) {
  const queryClient = useQueryClient();
  const [expandedSections, setExpandedSections] = useState({
    onboarding: true,
    complexity: true,
    supplement: true,
    installReady: false,
    expeditor: false,
  });
  const [localValues, setLocalValues] = useState({});
  const [confirmTrigger, setConfirmTrigger] = useState(null);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => opportunitiesApi.updateOpportunity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunities']);
      setLocalValues({});
      if (onUpdate) onUpdate();
    },
  });

  const getValue = (fieldId) => {
    if (localValues[fieldId] !== undefined) return localValues[fieldId];
    return opportunity[fieldId];
  };

  const handleChange = (fieldId, value, triggerWarning = null) => {
    // If this triggers an automation and value is true, show confirmation
    if (triggerWarning && value === true) {
      setConfirmTrigger({ fieldId, value, warning: triggerWarning });
      return;
    }

    setLocalValues(prev => ({ ...prev, [fieldId]: value }));

    // Auto-save for checkboxes and toggles
    updateMutation.mutate({
      id: opportunity.id,
      data: { [fieldId]: value },
    });
  };

  const handleConfirmTrigger = () => {
    if (!confirmTrigger) return;
    const { fieldId, value } = confirmTrigger;

    setLocalValues(prev => ({ ...prev, [fieldId]: value }));
    updateMutation.mutate({
      id: opportunity.id,
      data: { [fieldId]: value },
    });
    setConfirmTrigger(null);
  };

  const handleTextSave = (fieldId) => {
    const value = localValues[fieldId];
    if (value === undefined) return;

    updateMutation.mutate({
      id: opportunity.id,
      data: { [fieldId]: value },
    });
  };

  const shouldShowField = (field) => {
    if (!field.conditionalOn) return true;
    const dependsOnValue = getValue(field.conditionalOn);
    return dependsOnValue === field.conditionalValue;
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const renderField = (field) => {
    if (!shouldShowField(field)) return null;

    const Icon = field.icon;
    const value = getValue(field.id);
    const isLoading = updateMutation.isPending;

    switch (field.type) {
      case 'checkbox':
        return (
          <label
            key={field.id}
            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => handleChange(field.id, e.target.checked)}
              disabled={isLoading}
              className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
            />
            <Icon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700 flex-1">{field.label}</span>
            {value && <CheckCircle className="w-4 h-4 text-green-500" />}
            {field.helpText && (
              <span className="text-xs text-gray-400" title={field.helpText}>?</span>
            )}
          </label>
        );

      case 'toggle':
        return (
          <div
            key={field.id}
            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100"
          >
            <Icon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700 flex-1">{field.label}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleChange(field.id, false)}
                disabled={isLoading}
                className={`px-3 py-1 text-xs rounded-l-lg transition-colors ${
                  value === false || !value
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                No
              </button>
              <button
                onClick={() => handleChange(field.id, true, field.triggerWarning)}
                disabled={isLoading}
                className={`px-3 py-1 text-xs rounded-r-lg transition-colors ${
                  value === true
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Yes
              </button>
            </div>
            {value && field.triggerWarning && (
              <AlertCircle className="w-4 h-4 text-orange-500" title="Automation triggered" />
            )}
          </div>
        );

      case 'select':
        return (
          <div
            key={field.id}
            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100"
          >
            <Icon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700 flex-1">{field.label}</span>
            <select
              value={value || ''}
              onChange={(e) => handleChange(field.id, e.target.value || null)}
              disabled={isLoading}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            >
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );

      case 'textarea':
        return (
          <div key={field.id} className="p-3 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">{field.label}</span>
            </div>
            <textarea
              value={localValues[field.id] !== undefined ? localValues[field.id] : (value || '')}
              onChange={(e) => setLocalValues(prev => ({ ...prev, [field.id]: e.target.value }))}
              onBlur={() => handleTextSave(field.id)}
              disabled={isLoading}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
              placeholder={`Enter ${field.label.toLowerCase()}...`}
            />
          </div>
        );

      default:
        return null;
    }
  };

  const renderSection = (title, sectionKey, fields, icon) => {
    const SectionIcon = icon;
    const isExpanded = expandedSections[sectionKey];
    const visibleFields = fields.filter(shouldShowField);

    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <SectionIcon className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-700">{title}</span>
            <span className="text-xs text-gray-400">({visibleFields.length} items)</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {isExpanded && (
          <div className="p-3 space-y-2 bg-gray-50/50">
            {fields.map(renderField)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Expediting Start Date */}
      <div className="flex items-center gap-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
        <Calendar className="w-5 h-5 text-orange-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">Project Expediting Started</p>
          <p className="text-xs text-gray-500">
            {opportunity.projectExpeditingStartDate
              ? new Date(opportunity.projectExpeditingStartDate).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })
              : 'Not started yet'
            }
          </p>
        </div>
        {opportunity.projectExpeditor && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Expeditor</p>
            <p className="text-sm font-medium text-gray-900">
              {opportunity.projectExpeditor.fullName || opportunity.projectExpeditor.email}
            </p>
          </div>
        )}
      </div>

      {/* Checklist Sections */}
      {renderSection('Onboarding Verification', 'onboarding', ONBOARDING_VERIFICATION, CheckCircle)}
      {renderSection('Job Complexity Review', 'complexity', JOB_COMPLEXITY, Camera)}
      {renderSection('Supplement Handling', 'supplement', SUPPLEMENT_FIELDS, FileText)}
      {renderSection('Install Ready Status', 'installReady', INSTALL_READY_FIELDS, AlertCircle)}
      {renderSection('Expeditor Notes', 'expeditor', EXPEDITOR_FIELDS, UserCheck)}

      {/* Loading Indicator */}
      {updateMutation.isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving...
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmTrigger && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirm Automation</h3>
            </div>
            <p className="text-gray-600 mb-6">{confirmTrigger.warning}</p>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to proceed?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmTrigger(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTrigger}
                disabled={updateMutation.isPending}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Processing...' : 'Yes, Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
