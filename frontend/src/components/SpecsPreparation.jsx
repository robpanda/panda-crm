import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  X,
  FileText,
  Loader2,
  CheckCircle,
  Circle,
  Home,
  Wrench,
  Eye,
  MessageSquare,
  Droplets,
  Mountain,
  Wind,
  Satellite,
  Sun,
} from 'lucide-react';
import { opportunitiesApi } from '../services/api';

// Specs preparation step configuration
const STEPS = [
  { id: 'insurance', label: 'Insurance & Prerequisites', icon: FileText },
  { id: 'trades', label: 'Trades & Complexity', icon: Wrench },
  { id: 'conditions', label: 'Existing Conditions', icon: Home },
  { id: 'expectations', label: 'Customer Expectations', icon: MessageSquare },
  { id: 'piping', label: 'Piping & Flashing', icon: Droplets },
  { id: 'ridge', label: 'Ridge Information', icon: Mountain },
  { id: 'attic', label: 'Attic & Ventilation', icon: Wind },
  { id: 'satellite', label: 'Satellite Dishes', icon: Satellite },
  { id: 'skylights', label: 'Skylights', icon: Sun },
  { id: 'review', label: 'Review & Finish', icon: Check },
];

// Trade options
const TRADES = [
  { id: 'roofing', label: 'Roofing', description: 'Shingle replacement, repair, or new installation' },
  { id: 'gutters', label: 'Gutters', description: 'Gutter installation or replacement' },
  { id: 'siding', label: 'Siding', description: 'Siding installation or repair' },
  { id: 'trim_capping', label: 'Trim & Capping', description: 'Aluminum trim and capping work' },
  { id: 'solar', label: 'GAF Solar', description: 'Solar panel installation' },
  { id: 'skylight', label: 'Skylight', description: 'Skylight installation or replacement' },
  { id: 'interior', label: 'Interior Work', description: 'Interior repairs and finishing' },
  { id: 'insulation', label: 'Insulation', description: 'Attic and wall insulation installation or upgrade' },
  { id: 'timbersteel', label: 'GAF TimberSteel', description: 'TimberSteel roofing system' },
];

// Complexity levels
const COMPLEXITY_LEVELS = [
  { id: 'simple', label: 'Simple', description: 'Standard installation, no complications' },
  { id: 'moderate', label: 'Moderate', description: 'Some complexity, additional time needed' },
  { id: 'complex', label: 'Complex', description: 'Significant complexity, specialized work required' },
];

// Condition options
const CONDITION_OPTIONS = [
  { id: 'damaged_decking', label: 'Damaged Decking', category: 'roof' },
  { id: 'rotted_wood', label: 'Rotted Wood', category: 'structure' },
  { id: 'ice_dam_damage', label: 'Ice Dam Damage', category: 'roof' },
  { id: 'poor_ventilation', label: 'Poor Ventilation', category: 'ventilation' },
  { id: 'mold_mildew', label: 'Mold/Mildew Present', category: 'structure' },
  { id: 'animal_damage', label: 'Animal Damage', category: 'structure' },
  { id: 'multiple_layers', label: 'Multiple Roof Layers', category: 'roof' },
  { id: 'low_slope', label: 'Low Slope Areas', category: 'roof' },
];

// Pipe/Flashing types
const PIPE_TYPES = [
  { id: 'plumbing_vent', label: 'Plumbing Vent' },
  { id: 'exhaust_vent', label: 'Exhaust Vent' },
  { id: 'hvac_penetration', label: 'HVAC Penetration' },
  { id: 'radon_vent', label: 'Radon Vent' },
];

const FLASHING_TYPES = [
  { id: 'step_flashing', label: 'Step Flashing' },
  { id: 'counter_flashing', label: 'Counter Flashing' },
  { id: 'valley_flashing', label: 'Valley Flashing' },
  { id: 'drip_edge', label: 'Drip Edge' },
  { id: 'chimney_flashing', label: 'Chimney Flashing' },
];

// Ridge options
const RIDGE_OPTIONS = [
  { id: 'ridge_vent', label: 'Ridge Vent Required' },
  { id: 'ridge_cap', label: 'Ridge Cap Shingles' },
  { id: 'hip_ridge', label: 'Hip Ridge Present' },
];

// Ventilation options
const VENTILATION_OPTIONS = [
  { id: 'attic_fan', label: 'Attic Fan' },
  { id: 'power_vent', label: 'Power Vent' },
  { id: 'soffit_vents', label: 'Soffit Vents' },
  { id: 'gable_vents', label: 'Gable Vents' },
  { id: 'turbine_vents', label: 'Turbine Vents' },
  { id: 'box_vents', label: 'Box Vents' },
];

export default function SpecsPreparation({ opportunityId, opportunity, onComplete, onCancel }) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    // Insurance & Prerequisites
    insuranceCarrier: opportunity?.insuranceCarrier || '',
    claimNumber: opportunity?.claimNumber || '',
    deductible: opportunity?.deductible || '',
    rcvAmount: opportunity?.rcvAmount || '',
    acvAmount: opportunity?.acvAmount || '',
    hoaApprovalRequired: false,
    permitRequired: false,
    asbestosTestRequired: false,

    // Trades & Complexity
    selectedTrades: [],
    complexity: 'moderate',
    estimatedDays: 1,

    // Existing Conditions
    existingConditions: [],
    conditionNotes: '',

    // Customer Expectations
    customerPriorities: '',
    colorPreferences: '',
    specialRequests: '',
    accessNotes: '',

    // Piping & Flashing
    pipeTypes: [],
    pipeCount: 0,
    flashingTypes: [],
    flashingNotes: '',

    // Ridge Information
    ridgeOptions: [],
    ridgeLength: '',
    ridgeNotes: '',

    // Attic & Ventilation
    ventilationOptions: [],
    atticAccess: 'standard',
    insulationCondition: 'good',
    ventilationNotes: '',

    // Satellite Dishes
    hasSatelliteDish: false,
    satelliteCount: 0,
    satelliteAction: 'relocate', // relocate, remove, protect
    satelliteNotes: '',

    // Skylights
    hasSkylights: false,
    skylightCount: 0,
    skylightAction: 'reflash', // reflash, replace, remove
    skylightNotes: '',
  });

  const [errors, setErrors] = useState({});

  // Save specs mutation - calls the new specs/complete endpoint
  // This triggers the workflow to create WorkOrderLineItem and Contract Signing appointment
  const saveSpecsMutation = useMutation({
    mutationFn: async (data) => {
      // Call the specs/complete endpoint which:
      // 1. Updates opportunity with specsPrepped = true
      // 2. Triggers workflow to create WorkOrderLineItem
      // 3. Creates Contract Signing Service Appointment
      const response = await opportunitiesApi.completeSpecs(opportunityId, data);
      return response;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries(['opportunity', opportunityId]);
      // Also invalidate work orders and appointments since new ones were created
      queryClient.invalidateQueries(['workOrders', opportunityId]);
      queryClient.invalidateQueries(['appointments', opportunityId]);
      if (onComplete) {
        onComplete(formData, response?.data?.workflowResults);
      }
    },
  });

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is updated
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const toggleArrayItem = (field, item) => {
    setFormData((prev) => {
      const currentArray = prev[field] || [];
      if (currentArray.includes(item)) {
        return { ...prev, [field]: currentArray.filter((i) => i !== item) };
      }
      return { ...prev, [field]: [...currentArray, item] };
    });
  };

  const validateStep = (stepIndex) => {
    const step = STEPS[stepIndex];
    const newErrors = {};

    switch (step.id) {
      case 'insurance':
        // Insurance fields are optional but recommended
        break;
      case 'trades':
        if (formData.selectedTrades.length === 0) {
          newErrors.selectedTrades = 'Please select at least one trade';
        }
        break;
      case 'conditions':
        // Conditions are optional
        break;
      case 'expectations':
        // Expectations are optional but recommended
        break;
      // Other steps have no required fields
      default:
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = () => {
    saveSpecsMutation.mutate(formData);
  };

  const renderStepContent = () => {
    const step = STEPS[currentStep];

    switch (step.id) {
      case 'insurance':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium">Insurance Information</p>
                  <p className="mt-1">
                    Enter the insurance claim details and any prerequisites that need to be addressed
                    before work can begin.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Insurance Carrier
                </label>
                <input
                  type="text"
                  value={formData.insuranceCarrier}
                  onChange={(e) => updateField('insuranceCarrier', e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none text-base sm:text-sm"
                  placeholder="e.g., State Farm, Allstate"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Claim Number</label>
                <input
                  type="text"
                  value={formData.claimNumber}
                  onChange={(e) => updateField('claimNumber', e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none text-base sm:text-sm"
                  placeholder="Claim #"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RCV Amount ($)</label>
                <input
                  type="number"
                  value={formData.rcvAmount}
                  onChange={(e) => updateField('rcvAmount', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ACV Amount ($)</label>
                <input
                  type="number"
                  value={formData.acvAmount}
                  onChange={(e) => updateField('acvAmount', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deductible ($)</label>
                <input
                  type="number"
                  value={formData.deductible}
                  onChange={(e) => updateField('deductible', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Prerequisites</h4>
              <div className="space-y-3">
                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={formData.hoaApprovalRequired}
                    onChange={(e) => updateField('hoaApprovalRequired', e.target.checked)}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <div>
                    <span className="font-medium text-gray-900">HOA Approval Required</span>
                    <p className="text-sm text-gray-500">Property is in an HOA community</p>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={formData.permitRequired}
                    onChange={(e) => updateField('permitRequired', e.target.checked)}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Permit Required</span>
                    <p className="text-sm text-gray-500">Building permit needed for this work</p>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={formData.asbestosTestRequired}
                    onChange={(e) => updateField('asbestosTestRequired', e.target.checked)}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Asbestos Test Required</span>
                    <p className="text-sm text-gray-500">Home built before 1980, testing needed</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        );

      case 'trades':
        return (
          <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Wrench className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Select Trades & Complexity</p>
                  <p className="mt-1">
                    Choose all trades that will be included in this project and assess the overall
                    complexity level.
                  </p>
                </div>
              </div>
            </div>

            {errors.selectedTrades && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {errors.selectedTrades}
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Trades *</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {TRADES.map((trade) => (
                  <label
                    key={trade.id}
                    className={`flex items-start space-x-3 p-3 sm:p-3 rounded-lg border-2 cursor-pointer transition-all min-h-[52px] ${
                      formData.selectedTrades.includes(trade.id)
                        ? 'border-panda-primary bg-panda-light'
                        : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.selectedTrades.includes(trade.id)}
                      onChange={() => toggleArrayItem('selectedTrades', trade.id)}
                      className="w-5 h-5 sm:w-4 sm:h-4 text-panda-primary rounded focus:ring-panda-primary mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900 text-sm sm:text-base">{trade.label}</span>
                      <p className="text-xs text-gray-500 line-clamp-1">{trade.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Job Complexity</h4>
              <div className="space-y-2">
                {COMPLEXITY_LEVELS.map((level) => (
                  <label
                    key={level.id}
                    className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.complexity === level.id
                        ? 'border-panda-primary bg-panda-light'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="complexity"
                      checked={formData.complexity === level.id}
                      onChange={() => updateField('complexity', level.id)}
                      className="w-4 h-4 text-panda-primary focus:ring-panda-primary"
                    />
                    <div>
                      <span className="font-medium text-gray-900">{level.label}</span>
                      <p className="text-sm text-gray-500">{level.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estimated Days to Complete
              </label>
              <input
                type="number"
                min="1"
                value={formData.estimatedDays}
                onChange={(e) => updateField('estimatedDays', parseInt(e.target.value) || 1)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
              />
            </div>
          </div>
        );

      case 'conditions':
        return (
          <div className="space-y-6">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Home className="w-5 h-5 text-orange-600 mt-0.5" />
                <div className="text-sm text-orange-800">
                  <p className="font-medium">Existing Conditions</p>
                  <p className="mt-1">
                    Document any existing conditions that may affect the scope of work or require
                    special attention.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Select All Applicable Conditions
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {CONDITION_OPTIONS.map((condition) => (
                  <label
                    key={condition.id}
                    className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all min-h-[48px] ${
                      formData.existingConditions.includes(condition.id)
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.existingConditions.includes(condition.id)}
                      onChange={() => toggleArrayItem('existingConditions', condition.id)}
                      className="w-5 h-5 sm:w-4 sm:h-4 text-orange-500 rounded focus:ring-orange-500 shrink-0"
                    />
                    <span className="text-gray-900 text-sm sm:text-base">{condition.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Condition Notes
              </label>
              <textarea
                value={formData.conditionNotes}
                onChange={(e) => updateField('conditionNotes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                rows={4}
                placeholder="Describe any other existing conditions or concerns..."
              />
            </div>
          </div>
        );

      case 'expectations':
        return (
          <div className="space-y-6">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <MessageSquare className="w-5 h-5 text-purple-600 mt-0.5" />
                <div className="text-sm text-purple-800">
                  <p className="font-medium">Customer Expectations</p>
                  <p className="mt-1">
                    Capture what the customer expects from this project, including preferences and
                    special requests.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Priorities
              </label>
              <textarea
                value={formData.customerPriorities}
                onChange={(e) => updateField('customerPriorities', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                rows={3}
                placeholder="What are the customer's top priorities for this project?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color/Style Preferences
              </label>
              <textarea
                value={formData.colorPreferences}
                onChange={(e) => updateField('colorPreferences', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                rows={2}
                placeholder="Shingle color, siding style, etc."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
              <textarea
                value={formData.specialRequests}
                onChange={(e) => updateField('specialRequests', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                rows={3}
                placeholder="Any special requests or concerns from the customer..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Access Notes
              </label>
              <textarea
                value={formData.accessNotes}
                onChange={(e) => updateField('accessNotes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                rows={2}
                placeholder="Gate codes, parking instructions, pets, etc."
              />
            </div>
          </div>
        );

      case 'piping':
        return (
          <div className="space-y-6">
            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Droplets className="w-5 h-5 text-cyan-600 mt-0.5" />
                <div className="text-sm text-cyan-800">
                  <p className="font-medium">Piping & Flashing</p>
                  <p className="mt-1">
                    Document roof penetrations and flashing requirements for accurate material
                    ordering.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Pipe Types Present</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {PIPE_TYPES.map((pipe) => (
                  <label
                    key={pipe.id}
                    className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all min-h-[48px] ${
                      formData.pipeTypes.includes(pipe.id)
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.pipeTypes.includes(pipe.id)}
                      onChange={() => toggleArrayItem('pipeTypes', pipe.id)}
                      className="w-5 h-5 sm:w-4 sm:h-4 text-cyan-500 rounded focus:ring-cyan-500 shrink-0"
                    />
                    <span className="text-gray-900 text-sm sm:text-base">{pipe.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Pipe Count</label>
              <input
                type="number"
                min="0"
                value={formData.pipeCount}
                onChange={(e) => updateField('pipeCount', parseInt(e.target.value) || 0)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
              />
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Flashing Types Required</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {FLASHING_TYPES.map((flashing) => (
                  <label
                    key={flashing.id}
                    className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all min-h-[48px] ${
                      formData.flashingTypes.includes(flashing.id)
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.flashingTypes.includes(flashing.id)}
                      onChange={() => toggleArrayItem('flashingTypes', flashing.id)}
                      className="w-5 h-5 sm:w-4 sm:h-4 text-cyan-500 rounded focus:ring-cyan-500 shrink-0"
                    />
                    <span className="text-gray-900 text-sm sm:text-base">{flashing.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Flashing Notes</label>
              <textarea
                value={formData.flashingNotes}
                onChange={(e) => updateField('flashingNotes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                rows={2}
                placeholder="Special flashing requirements or concerns..."
              />
            </div>
          </div>
        );

      case 'ridge':
        return (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Mountain className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="text-sm text-green-800">
                  <p className="font-medium">Ridge Information</p>
                  <p className="mt-1">
                    Document ridge specifications for proper ventilation and cap installation.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Ridge Options</h4>
              <div className="space-y-2">
                {RIDGE_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.ridgeOptions.includes(option.id)
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.ridgeOptions.includes(option.id)}
                      onChange={() => toggleArrayItem('ridgeOptions', option.id)}
                      className="w-4 h-4 text-green-500 rounded focus:ring-green-500"
                    />
                    <span className="text-gray-900">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ridge Length (feet)
              </label>
              <input
                type="number"
                min="0"
                value={formData.ridgeLength}
                onChange={(e) => updateField('ridgeLength', e.target.value)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ridge Notes</label>
              <textarea
                value={formData.ridgeNotes}
                onChange={(e) => updateField('ridgeNotes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                rows={2}
                placeholder="Additional ridge information..."
              />
            </div>
          </div>
        );

      case 'attic':
        return (
          <div className="space-y-6">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Wind className="w-5 h-5 text-teal-600 mt-0.5" />
                <div className="text-sm text-teal-800">
                  <p className="font-medium">Attic & Ventilation</p>
                  <p className="mt-1">
                    Document existing ventilation systems and attic conditions for proper airflow
                    design.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Existing Ventilation</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {VENTILATION_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all min-h-[48px] ${
                      formData.ventilationOptions.includes(option.id)
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.ventilationOptions.includes(option.id)}
                      onChange={() => toggleArrayItem('ventilationOptions', option.id)}
                      className="w-5 h-5 sm:w-4 sm:h-4 text-teal-500 rounded focus:ring-teal-500 shrink-0"
                    />
                    <span className="text-gray-900 text-sm sm:text-base">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attic Access</label>
                <select
                  value={formData.atticAccess}
                  onChange={(e) => updateField('atticAccess', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                >
                  <option value="standard">Standard Access</option>
                  <option value="limited">Limited Access</option>
                  <option value="none">No Access</option>
                  <option value="pulldown">Pull-Down Stairs</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Insulation Condition
                </label>
                <select
                  value={formData.insulationCondition}
                  onChange={(e) => updateField('insulationCondition', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                >
                  <option value="good">Good Condition</option>
                  <option value="fair">Fair Condition</option>
                  <option value="poor">Poor Condition</option>
                  <option value="missing">Missing/Inadequate</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ventilation Notes</label>
              <textarea
                value={formData.ventilationNotes}
                onChange={(e) => updateField('ventilationNotes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                rows={2}
                placeholder="Additional ventilation information..."
              />
            </div>
          </div>
        );

      case 'satellite':
        return (
          <div className="space-y-6">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Satellite className="w-5 h-5 text-indigo-600 mt-0.5" />
                <div className="text-sm text-indigo-800">
                  <p className="font-medium">Satellite Dishes</p>
                  <p className="mt-1">
                    Document any satellite dishes that need to be addressed during the project.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={formData.hasSatelliteDish}
                  onChange={(e) => updateField('hasSatelliteDish', e.target.checked)}
                  className="w-5 h-5 text-indigo-500 rounded focus:ring-indigo-500"
                />
                <div>
                  <span className="font-medium text-gray-900">Satellite Dish(es) Present</span>
                  <p className="text-sm text-gray-500">Check if there are satellite dishes on the roof</p>
                </div>
              </label>
            </div>

            {formData.hasSatelliteDish && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Dishes
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.satelliteCount}
                    onChange={(e) => updateField('satelliteCount', parseInt(e.target.value) || 1)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Action Required
                  </label>
                  <div className="space-y-2">
                    {[
                      { id: 'relocate', label: 'Relocate', desc: 'Move dish to new location on roof' },
                      { id: 'remove', label: 'Remove', desc: 'Customer wants dish removed' },
                      { id: 'protect', label: 'Protect in Place', desc: 'Work around existing dish' },
                    ].map((action) => (
                      <label
                        key={action.id}
                        className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          formData.satelliteAction === action.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="satelliteAction"
                          checked={formData.satelliteAction === action.id}
                          onChange={() => updateField('satelliteAction', action.id)}
                          className="w-4 h-4 text-indigo-500 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="font-medium text-gray-900">{action.label}</span>
                          <p className="text-sm text-gray-500">{action.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Satellite Notes
                  </label>
                  <textarea
                    value={formData.satelliteNotes}
                    onChange={(e) => updateField('satelliteNotes', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    rows={2}
                    placeholder="Provider info, cable routing, etc."
                  />
                </div>
              </>
            )}
          </div>
        );

      case 'skylights':
        return (
          <div className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Sun className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Skylights</p>
                  <p className="mt-1">
                    Document any skylights that need attention during the roofing project.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={formData.hasSkylights}
                  onChange={(e) => updateField('hasSkylights', e.target.checked)}
                  className="w-5 h-5 text-yellow-500 rounded focus:ring-yellow-500"
                />
                <div>
                  <span className="font-medium text-gray-900">Skylight(s) Present</span>
                  <p className="text-sm text-gray-500">Check if there are skylights on the roof</p>
                </div>
              </label>
            </div>

            {formData.hasSkylights && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Skylights
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.skylightCount}
                    onChange={(e) => updateField('skylightCount', parseInt(e.target.value) || 1)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Action Required
                  </label>
                  <div className="space-y-2">
                    {[
                      { id: 'reflash', label: 'Reflash', desc: 'Install new flashing around existing skylight' },
                      { id: 'replace', label: 'Replace', desc: 'Install new skylight' },
                      { id: 'remove', label: 'Remove', desc: 'Remove skylight and deck over opening' },
                    ].map((action) => (
                      <label
                        key={action.id}
                        className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          formData.skylightAction === action.id
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="skylightAction"
                          checked={formData.skylightAction === action.id}
                          onChange={() => updateField('skylightAction', action.id)}
                          className="w-4 h-4 text-yellow-500 focus:ring-yellow-500"
                        />
                        <div>
                          <span className="font-medium text-gray-900">{action.label}</span>
                          <p className="text-sm text-gray-500">{action.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Skylight Notes
                  </label>
                  <textarea
                    value={formData.skylightNotes}
                    onChange={(e) => updateField('skylightNotes', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    rows={2}
                    placeholder="Size, brand, condition, etc."
                  />
                </div>
              </>
            )}
          </div>
        );

      case 'review':
        return (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="text-sm text-green-800">
                  <p className="font-medium">Review & Complete</p>
                  <p className="mt-1">
                    Review the specs information below. Click "Finish" to save and update the
                    opportunity status to "Specs Prepped".
                  </p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Trades Selected</h4>
                <div className="flex flex-wrap gap-2">
                  {formData.selectedTrades.map((tradeId) => {
                    const trade = TRADES.find((t) => t.id === tradeId);
                    return (
                      <span
                        key={tradeId}
                        className="px-2 py-1 bg-panda-primary text-white text-sm rounded"
                      >
                        {trade?.label || tradeId}
                      </span>
                    );
                  })}
                  {formData.selectedTrades.length === 0 && (
                    <span className="text-gray-500 text-sm">No trades selected</span>
                  )}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Project Details</h4>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Complexity:</span>{' '}
                    <span className="font-medium capitalize">{formData.complexity}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Estimated Days:</span>{' '}
                    <span className="font-medium">{formData.estimatedDays}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Conditions Found:</span>{' '}
                    <span className="font-medium">{formData.existingConditions.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Pipe Count:</span>{' '}
                    <span className="font-medium">{formData.pipeCount}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Prerequisites</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center space-x-2">
                    {formData.hoaApprovalRequired ? (
                      <CheckCircle className="w-4 h-4 text-orange-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300" />
                    )}
                    <span>HOA Approval Required</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {formData.permitRequired ? (
                      <CheckCircle className="w-4 h-4 text-orange-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300" />
                    )}
                    <span>Permit Required</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {formData.asbestosTestRequired ? (
                      <CheckCircle className="w-4 h-4 text-orange-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300" />
                    )}
                    <span>Asbestos Test Required</span>
                  </div>
                </div>
              </div>

              {(formData.hasSatelliteDish || formData.hasSkylights) && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Roof Penetrations</h4>
                  <div className="space-y-1 text-sm">
                    {formData.hasSatelliteDish && (
                      <div>
                        Satellite Dishes: {formData.satelliteCount} ({formData.satelliteAction})
                      </div>
                    )}
                    {formData.hasSkylights && (
                      <div>
                        Skylights: {formData.skylightCount} ({formData.skylightAction})
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      {/* Full-screen on mobile, modal on desktop */}
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-4xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header - Compact on mobile */}
        <div className="p-3 sm:p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className="p-1.5 sm:p-2 bg-panda-primary/10 rounded-lg shrink-0">
              <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-panda-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 text-sm sm:text-base truncate">Prepare Specs</h2>
              <p className="text-xs sm:text-sm text-gray-500 truncate">
                {currentStep + 1}/{STEPS.length}: {STEPS[currentStep].label}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-lg shrink-0 -mr-1">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Mobile Progress Bar - Simplified for small screens */}
        <div className="sm:hidden px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">Progress</span>
            <span className="text-xs text-gray-500">{Math.round((currentStep / (STEPS.length - 1)) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-panda-primary transition-all duration-300"
              style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* Desktop Progress Steps - Hidden on mobile */}
        <div className="hidden sm:block px-4 py-3 bg-gray-50 border-b border-gray-200 overflow-x-auto shrink-0">
          <div className="flex space-x-1 min-w-max">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;

              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(index)}
                  disabled={index > currentStep + 1}
                  className={`flex items-center space-x-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-panda-primary text-white'
                      : isCompleted
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <StepIcon className="w-3.5 h-3.5" />
                  )}
                  <span>{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content - More padding on mobile for touch targets */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{renderStepContent()}</div>

        {/* Footer - Mobile optimized with larger touch targets */}
        <div className="p-3 sm:p-4 border-t border-gray-200 flex items-center justify-between shrink-0 bg-white safe-area-inset-bottom">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2.5 sm:py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="text-sm sm:text-base">Back</span>
          </button>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Cancel button hidden on mobile to save space - can close via X */}
            <button
              onClick={onCancel}
              className="hidden sm:block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>

            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center justify-center space-x-1 sm:space-x-2 px-4 sm:px-4 py-2.5 sm:py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark min-h-[44px] min-w-[100px]"
              >
                <span className="text-sm sm:text-base">Next</span>
                <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saveSpecsMutation.isPending}
                className="flex items-center justify-center space-x-1 sm:space-x-2 px-4 sm:px-4 py-2.5 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 min-h-[44px] min-w-[100px]"
              >
                {saveSpecsMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" />
                    <span className="text-sm sm:text-base">Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 sm:w-4 sm:h-4" />
                    <span className="text-sm sm:text-base">Finish</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
