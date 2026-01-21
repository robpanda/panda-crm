import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Package,
  Ruler,
  ClipboardList,
  Wrench,
  DollarSign,
  CheckCircle,
  Circle,
  Search,
  Loader2,
  AlertCircle,
  Plus,
  Minus,
  Trash2,
  FileText,
  Layers,
  Mountain,
  PlayCircle,
  Droplets,
  Wind,
  Shield,
  Hammer,
  ArrowDown,
  Clock,
} from 'lucide-react';
import {
  orderTemplatesApi,
  laborOrdersApi,
  scheduleApi,
  measurementsApi,
} from '../services/api';

// Wizard Steps
const STEPS = [
  { id: 'template', label: 'Select Template', icon: FileText, description: 'Choose an order template' },
  { id: 'measurements', label: 'Confirm Measurements', icon: Ruler, description: 'Review roof measurements' },
  { id: 'materials', label: 'Draft Material Order', icon: Package, description: 'Select materials' },
  { id: 'materialConfirm', label: 'Confirm Materials', icon: ClipboardList, description: 'Review material order' },
  { id: 'workOrder', label: 'Create Work Order', icon: Wrench, description: 'Select work type & options' },
  { id: 'laborOrder', label: 'Create Labor Order', icon: DollarSign, description: 'Add labor items' },
  { id: 'review', label: 'Review & Finish', icon: CheckCircle, description: 'Submit orders' },
];

// Work Types
const WORK_TYPES = [
  { id: 'gold_pledge', label: 'Gold Pledge', description: 'Premium warranty package' },
  { id: 'solar', label: 'Solar', description: 'Solar panel installation' },
  { id: 'siding', label: 'Siding', description: 'Siding installation' },
  { id: 'gutter', label: 'Gutter', description: 'Gutter installation' },
  { id: 'standard', label: 'Standard Roof Installation', description: 'Standard roofing work' },
];

// Additional Work Options
const ADDITIONAL_WORK_OPTIONS = [
  { id: 'siding', label: 'Siding' },
  { id: 'solar_dnr', label: 'Solar DNR' },
  { id: 'gutter', label: 'Gutter' },
  { id: 'trim_work', label: 'Trim Work' },
  { id: 'interior_work', label: 'Interior Work' },
  { id: 'attic_insulation', label: 'Attic Insulation' },
];

// Material Categories with icons
const MATERIAL_CATEGORIES = [
  { id: 'SHINGLES', label: 'Shingles', icon: Layers },
  { id: 'HIP_RIDGE', label: 'Hip & Ridge', icon: Mountain },
  { id: 'STARTER', label: 'Starter', icon: PlayCircle },
  { id: 'UNDERLAYMENT', label: 'Underlayment', icon: FileText },
  { id: 'COIL_NAILS', label: 'Coil Nails', icon: Hammer },
  { id: 'PIPE_FLASHING', label: 'Pipe Flashing', icon: Droplets },
  { id: 'OTHER_FLASHING', label: 'Other Flashing', icon: Wrench },
  { id: 'VENTS', label: 'Vents', icon: Wind },
  { id: 'DRIP_EDGE', label: 'Drip Edge', icon: ArrowDown },
  { id: 'ICE_WATER', label: 'Ice & Water Shield', icon: Shield },
];

// Mock products (replace with API call)
const MOCK_PRODUCTS = {
  SHINGLES: [
    { id: 'sh1', name: 'GAF Timberline HDZ Charcoal', sku: 'GAF-THZ-CHAR', unitPrice: 35, uom: 'BDL' },
    { id: 'sh2', name: 'GAF Timberline HDZ Weathered Wood', sku: 'GAF-THZ-WW', unitPrice: 35, uom: 'BDL' },
    { id: 'sh3', name: 'GAF Timberline HDZ Pewter Gray', sku: 'GAF-THZ-PG', unitPrice: 35, uom: 'BDL' },
    { id: 'sh4', name: 'GAF Timberline HDZ Barkwood', sku: 'GAF-THZ-BW', unitPrice: 35, uom: 'BDL' },
  ],
  HIP_RIDGE: [
    { id: 'hr1', name: 'GAF Seal-A-Ridge Cap Shingles Charcoal', sku: 'GAF-SAR-CHAR', unitPrice: 65, uom: 'BDL' },
    { id: 'hr2', name: 'GAF TimberTex Ridge Cap Shingles', sku: 'GAF-TT-RC', unitPrice: 75, uom: 'BDL' },
  ],
  STARTER: [
    { id: 'st1', name: 'GAF Pro-Start Starter Strip', sku: 'GAF-PS', unitPrice: 25, uom: 'BDL' },
    { id: 'st2', name: 'GAF WeatherBlocker Starter Strip', sku: 'GAF-WB', unitPrice: 28, uom: 'BDL' },
  ],
  UNDERLAYMENT: [
    { id: 'ul1', name: 'GAF FeltBuster Synthetic Underlayment', sku: 'GAF-FB', unitPrice: 85, uom: 'ROLL' },
    { id: 'ul2', name: 'GAF Tiger Paw Synthetic Underlayment', sku: 'GAF-TP', unitPrice: 95, uom: 'ROLL' },
  ],
  COIL_NAILS: [
    { id: 'cn1', name: '1-1/4" Coil Roofing Nails', sku: 'NAIL-1.25', unitPrice: 45, uom: 'BOX' },
    { id: 'cn2', name: '1-1/2" Coil Roofing Nails', sku: 'NAIL-1.5', unitPrice: 48, uom: 'BOX' },
  ],
  PIPE_FLASHING: [
    { id: 'pf1', name: 'Pipe Boot 1-1/2" to 3"', sku: 'PB-1.5-3', unitPrice: 12, uom: 'EA' },
    { id: 'pf2', name: 'Pipe Boot 3" to 4"', sku: 'PB-3-4', unitPrice: 15, uom: 'EA' },
  ],
  OTHER_FLASHING: [
    { id: 'of1', name: 'Step Flashing 4x4x8', sku: 'SF-4x4x8', unitPrice: 18, uom: 'BDL' },
    { id: 'of2', name: 'Chimney Flashing Kit', sku: 'CF-KIT', unitPrice: 45, uom: 'EA' },
  ],
  VENTS: [
    { id: 'v1', name: 'Off Ridge Vent', sku: 'ORV', unitPrice: 25, uom: 'EA' },
    { id: 'v2', name: 'Box Vent', sku: 'BV', unitPrice: 18, uom: 'EA' },
    { id: 'v3', name: 'Ridge Vent 4ft', sku: 'RV-4', unitPrice: 12, uom: 'EA' },
  ],
  DRIP_EDGE: [
    { id: 'de1', name: 'Drip Edge 1.5" x 10ft White', sku: 'DE-W', unitPrice: 8, uom: 'EA' },
    { id: 'de2', name: 'Drip Edge 1.5" x 10ft Brown', sku: 'DE-B', unitPrice: 8, uom: 'EA' },
  ],
  ICE_WATER: [
    { id: 'iw1', name: 'GAF StormGuard Film Leak Barrier', sku: 'GAF-SG', unitPrice: 125, uom: 'ROLL' },
    { id: 'iw2', name: 'GAF WeatherWatch Mineral Leak Barrier', sku: 'GAF-WW-M', unitPrice: 95, uom: 'ROLL' },
  ],
};

export default function MaterialLaborOrderWizard({
  isOpen,
  onClose,
  opportunity,
  workOrder,
  onComplete,
}) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    // Template selection
    selectedTemplate: null,

    // Measurements (from opportunity/measurement report)
    measurements: {
      totalRoofArea: 0,
      totalRoofSquares: 0,
      suggestedWaste: 10,
      ridgeLength: 0,
      hipLength: 0,
      valleyLength: 0,
      rakeLength: 0,
      eaveLength: 0,
      flashingLength: 0,
      stepFlashingLength: 0,
    },

    // Material order
    selectedMaterials: [],

    // Work order
    workType: '',
    additionalWork: [],

    // Labor order
    laborItems: [],
  });

  const [searchTerms, setSearchTerms] = useState({});
  const [activeMaterialCategory, setActiveMaterialCategory] = useState('SHINGLES');
  const [activeLaborCategory, setActiveLaborCategory] = useState('Gold Pledge Installation');

  // Fetch order templates
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['orderTemplates'],
    queryFn: async () => {
      const result = await orderTemplatesApi.getOrderTemplates({ isActive: 'true' });
      return result?.data || [];
    },
    enabled: isOpen,
  });

  // Fetch measurement report for this opportunity
  const { data: measurementReport } = useQuery({
    queryKey: ['measurementReport', opportunity?.id],
    queryFn: async () => {
      const result = await measurementsApi.getMeasurementReports({ opportunityId: opportunity?.id });
      return result?.data?.[0] || null;
    },
    enabled: isOpen && !!opportunity?.id,
  });

  // Fetch work types
  const { data: workTypes } = useQuery({
    queryKey: ['workTypes'],
    queryFn: async () => {
      const result = await scheduleApi.getWorkTypes();
      return result || [];
    },
    enabled: isOpen,
  });

  // Fetch default labor items when work type changes
  const { data: defaultLaborItems } = useQuery({
    queryKey: ['defaultLaborItems', formData.workType],
    queryFn: async () => {
      if (!formData.workType) return [];
      const result = await laborOrdersApi.getDefaultLaborItems(formData.workType);
      return result?.data || [];
    },
    enabled: isOpen && !!formData.workType,
  });

  // Initialize measurements from measurement report
  useEffect(() => {
    if (measurementReport) {
      setFormData(prev => ({
        ...prev,
        measurements: {
          totalRoofArea: measurementReport.totalRoofArea || 0,
          totalRoofSquares: measurementReport.totalRoofSquares || 0,
          suggestedWaste: measurementReport.suggestedWasteFactor || 10,
          ridgeLength: measurementReport.ridgeLength || 0,
          hipLength: measurementReport.hipLength || 0,
          valleyLength: measurementReport.valleyLength || 0,
          rakeLength: measurementReport.rakeLength || 0,
          eaveLength: measurementReport.eaveLength || 0,
          flashingLength: measurementReport.flashingLength || 0,
          stepFlashingLength: measurementReport.stepFlashingLength || 0,
        },
      }));
    }
  }, [measurementReport]);

  // Load default labor items when work type changes
  useEffect(() => {
    if (defaultLaborItems && defaultLaborItems.length > 0 && formData.laborItems.length === 0) {
      setFormData(prev => ({
        ...prev,
        laborItems: defaultLaborItems.map(item => ({
          ...item,
          selected: true,
          quantity: calculateLaborQuantity(item, prev.measurements),
        })),
      }));
    }
  }, [defaultLaborItems]);

  // Calculate labor quantity based on measurements
  const calculateLaborQuantity = (item, measurements) => {
    const { uom } = item;
    if (uom === 'SQ') return measurements.totalRoofSquares || 1;
    if (uom === 'LF' && item.productName?.toLowerCase().includes('ridge')) return measurements.ridgeLength || 1;
    if (uom === 'LF' && item.productName?.toLowerCase().includes('drip')) return measurements.eaveLength + measurements.rakeLength || 1;
    if (uom === 'LF' && item.productName?.toLowerCase().includes('starter')) return measurements.eaveLength || 1;
    return 1;
  };

  // Navigate steps
  const goToNextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template) => {
    setFormData(prev => ({
      ...prev,
      selectedTemplate: template,
    }));
  };

  // Handle material selection
  const handleMaterialToggle = (product, category) => {
    setFormData(prev => {
      const existing = prev.selectedMaterials.find(m => m.id === product.id);
      if (existing) {
        return {
          ...prev,
          selectedMaterials: prev.selectedMaterials.filter(m => m.id !== product.id),
        };
      }
      return {
        ...prev,
        selectedMaterials: [
          ...prev.selectedMaterials,
          {
            ...product,
            category,
            quantity: 1,
          },
        ],
      };
    });
  };

  // Handle material quantity change
  const handleMaterialQuantityChange = (productId, quantity) => {
    setFormData(prev => ({
      ...prev,
      selectedMaterials: prev.selectedMaterials.map(m =>
        m.id === productId ? { ...m, quantity: Math.max(1, quantity) } : m
      ),
    }));
  };

  // Handle work type selection
  const handleWorkTypeSelect = (workType) => {
    setFormData(prev => ({
      ...prev,
      workType,
      laborItems: [], // Reset labor items when work type changes
    }));
  };

  // Handle additional work toggle
  const handleAdditionalWorkToggle = (workId) => {
    setFormData(prev => ({
      ...prev,
      additionalWork: prev.additionalWork.includes(workId)
        ? prev.additionalWork.filter(w => w !== workId)
        : [...prev.additionalWork, workId],
    }));
  };

  // Handle labor item toggle
  const handleLaborItemToggle = (item) => {
    setFormData(prev => {
      const existing = prev.laborItems.find(l => l.productName === item.productName);
      if (existing) {
        return {
          ...prev,
          laborItems: prev.laborItems.map(l =>
            l.productName === item.productName ? { ...l, selected: !l.selected } : l
          ),
        };
      }
      return {
        ...prev,
        laborItems: [...prev.laborItems, { ...item, selected: true }],
      };
    });
  };

  // Handle labor quantity change
  const handleLaborQuantityChange = (productName, quantity) => {
    setFormData(prev => ({
      ...prev,
      laborItems: prev.laborItems.map(l =>
        l.productName === productName ? { ...l, quantity: Math.max(1, quantity) } : l
      ),
    }));
  };

  // Calculate totals
  const materialTotal = useMemo(() => {
    return formData.selectedMaterials.reduce(
      (sum, m) => sum + (m.unitPrice || 0) * (m.quantity || 1),
      0
    );
  }, [formData.selectedMaterials]);

  const laborTotal = useMemo(() => {
    return formData.laborItems
      .filter(l => l.selected)
      .reduce(
        (sum, l) => sum + (l.unitPrice || l.listPrice || 0) * (l.quantity || 1),
        0
      );
  }, [formData.laborItems]);

  // Submit the wizard
  const handleSubmit = async () => {
    // Here you would create the material order, work order, and labor order
    // For now, just log and close
    console.log('Submitting orders:', formData);
    onComplete?.(formData);
    onClose();
  };

  // Check if current step is complete
  const isStepComplete = (stepIndex) => {
    switch (STEPS[stepIndex].id) {
      case 'template':
        return !!formData.selectedTemplate;
      case 'measurements':
        return formData.measurements.totalRoofSquares > 0;
      case 'materials':
        return formData.selectedMaterials.length > 0;
      case 'materialConfirm':
        return formData.selectedMaterials.length > 0;
      case 'workOrder':
        return !!formData.workType;
      case 'laborOrder':
        return formData.laborItems.some(l => l.selected);
      case 'review':
        return true;
      default:
        return true;
    }
  };

  if (!isOpen) return null;

  const currentStepData = STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold">Create Material & Labor Orders</h2>
            <p className="text-sm text-blue-100">
              {opportunity?.name || 'New Order'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-4 py-3 border-b bg-gray-50 overflow-x-auto">
          <div className="flex items-center min-w-max">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep || isStepComplete(index);

              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => index <= currentStep && setCurrentStep(index)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                      isActive
                        ? 'bg-blue-100 text-blue-700'
                        : isCompleted
                          ? 'text-green-600 hover:bg-gray-100'
                          : 'text-gray-400'
                    }`}
                    disabled={index > currentStep}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-300 text-white'
                    }`}>
                      {isCompleted && index < currentStep ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span className="text-xs font-bold">{index + 1}</span>
                      )}
                    </div>
                    <span className="text-sm font-medium hidden md:inline">{step.label}</span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-gray-300 mx-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Step 1: Template Selection */}
          {currentStepData.id === 'template' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Select Order Template</h3>
                <p className="text-sm text-gray-500">Choose a template to start your material order</p>
              </div>

              {templatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="space-y-3">
                  {(templates || []).map(template => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template)}
                      className={`w-full p-4 rounded-xl border-2 transition text-left ${
                        formData.selectedTemplate?.id === template.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          formData.selectedTemplate?.id === template.id
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-300'
                        }`}>
                          {formData.selectedTemplate?.id === template.id && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{template.name}</span>
                            {template.supplier && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                {template.supplier}
                              </span>
                            )}
                            {!template.isActive && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                                Coming Soon
                              </span>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}

                  {(!templates || templates.length === 0) && (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500">No order templates available</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Contact admin to set up order templates
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Confirm Measurements */}
          {currentStepData.id === 'measurements' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Confirm Measurements</h3>
                <p className="text-sm text-gray-500">Review measurements that drive material quantities</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MeasurementField
                  label="Total Roof Area"
                  value={formData.measurements.totalRoofArea}
                  unit="SF"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, totalRoofArea: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Roof Squares"
                  value={formData.measurements.totalRoofSquares}
                  unit="SQ"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, totalRoofSquares: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Suggested Waste"
                  value={formData.measurements.suggestedWaste}
                  unit="%"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, suggestedWaste: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Ridges"
                  value={formData.measurements.ridgeLength}
                  unit="LF"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, ridgeLength: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Hips"
                  value={formData.measurements.hipLength}
                  unit="LF"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, hipLength: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Valleys"
                  value={formData.measurements.valleyLength}
                  unit="LF"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, valleyLength: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Rakes"
                  value={formData.measurements.rakeLength}
                  unit="LF"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, rakeLength: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Eaves"
                  value={formData.measurements.eaveLength}
                  unit="LF"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, eaveLength: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Flashing"
                  value={formData.measurements.flashingLength}
                  unit="LF"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, flashingLength: parseFloat(val) || 0 },
                  }))}
                />
                <MeasurementField
                  label="Step Flashing"
                  value={formData.measurements.stepFlashingLength}
                  unit="LF"
                  onChange={(val) => setFormData(prev => ({
                    ...prev,
                    measurements: { ...prev.measurements, stepFlashingLength: parseFloat(val) || 0 },
                  }))}
                />
              </div>

              {!measurementReport && (
                <div className="mt-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800">No Measurement Report Found</p>
                      <p className="text-sm text-yellow-700 mt-1">
                        Please enter measurements manually or order a measurement report.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Draft Material Order */}
          {currentStepData.id === 'materials' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Draft Material Order</h3>
                <p className="text-sm text-gray-500">Select materials for your order</p>
              </div>

              {/* Category Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
                {MATERIAL_CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const selectedCount = formData.selectedMaterials.filter(m => m.category === cat.id).length;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveMaterialCategory(cat.id)}
                      className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        activeMaterialCategory === cat.id
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{cat.label}</span>
                      {selectedCount > 0 && (
                        <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {selectedCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerms[activeMaterialCategory] || ''}
                  onChange={(e) => setSearchTerms(prev => ({ ...prev, [activeMaterialCategory]: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Product List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(MOCK_PRODUCTS[activeMaterialCategory] || [])
                  .filter(p =>
                    !searchTerms[activeMaterialCategory] ||
                    p.name.toLowerCase().includes(searchTerms[activeMaterialCategory].toLowerCase())
                  )
                  .map(product => {
                    const isSelected = formData.selectedMaterials.some(m => m.id === product.id);
                    const selectedItem = formData.selectedMaterials.find(m => m.id === product.id);

                    return (
                      <div
                        key={product.id}
                        className={`p-3 rounded-xl border-2 transition ${
                          isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleMaterialToggle(product, activeMaterialCategory)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                              isSelected
                                ? 'bg-blue-500 border-blue-500 text-white'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.sku}</p>
                          </div>

                          {isSelected && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleMaterialQuantityChange(product.id, (selectedItem?.quantity || 1) - 1)}
                                className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                value={selectedItem?.quantity || 1}
                                onChange={(e) => handleMaterialQuantityChange(product.id, parseInt(e.target.value) || 1)}
                                className="w-14 h-7 text-center border rounded-lg text-sm"
                              />
                              <button
                                onClick={() => handleMaterialQuantityChange(product.id, (selectedItem?.quantity || 1) + 1)}
                                className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          <div className="text-right">
                            <p className="font-medium text-gray-900">${product.unitPrice}</p>
                            <p className="text-xs text-gray-500">{product.uom}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Step 4: Confirm Material Order */}
          {currentStepData.id === 'materialConfirm' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Confirm Order Products</h3>
                <p className="text-sm text-gray-500">Review your material order</p>
              </div>

              {formData.selectedMaterials.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">No materials selected</p>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="text-blue-600 text-sm mt-2 hover:underline"
                  >
                    Go back to select materials
                  </button>
                </div>
              ) : (
                <>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-3 font-medium text-gray-700">Type</th>
                          <th className="text-left p-3 font-medium text-gray-700">Material Name</th>
                          <th className="text-center p-3 font-medium text-gray-700">Qty</th>
                          <th className="text-center p-3 font-medium text-gray-700">UOM</th>
                          <th className="text-right p-3 font-medium text-gray-700">Price</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {formData.selectedMaterials.map(material => (
                          <tr key={material.id} className="hover:bg-gray-50">
                            <td className="p-3 text-gray-500">
                              {MATERIAL_CATEGORIES.find(c => c.id === material.category)?.label}
                            </td>
                            <td className="p-3 font-medium text-gray-900">{material.name}</td>
                            <td className="p-3 text-center">{material.quantity}</td>
                            <td className="p-3 text-center text-gray-500">{material.uom}</td>
                            <td className="p-3 text-right font-medium">
                              ${((material.unitPrice || 0) * (material.quantity || 1)).toFixed(2)}
                            </td>
                            <td className="p-3">
                              <button
                                onClick={() => handleMaterialToggle(material, material.category)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td colSpan="4" className="p-3 text-right">Total:</td>
                          <td className="p-3 text-right text-lg">${materialTotal.toFixed(2)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 5: Create Work Order */}
          {currentStepData.id === 'workOrder' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Create Work Order</h3>
                <p className="text-sm text-gray-500">Select work type and additional options</p>
              </div>

              <div className="space-y-6">
                {/* Work Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Work Type</label>
                  <div className="space-y-2">
                    {(workTypes || WORK_TYPES).map(wt => (
                      <button
                        key={wt.id}
                        onClick={() => handleWorkTypeSelect(wt.name || wt.label)}
                        className={`w-full p-4 rounded-xl border-2 text-left transition ${
                          formData.workType === (wt.name || wt.label)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            formData.workType === (wt.name || wt.label)
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-300'
                          }`}>
                            {formData.workType === (wt.name || wt.label) && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{wt.name || wt.label}</p>
                            {wt.description && (
                              <p className="text-sm text-gray-500">{wt.description}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Additional Work Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Additional Work (Optional)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ADDITIONAL_WORK_OPTIONS.map(option => (
                      <button
                        key={option.id}
                        onClick={() => handleAdditionalWorkToggle(option.id)}
                        className={`p-3 rounded-xl border-2 text-left transition ${
                          formData.additionalWork.includes(option.id)
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            formData.additionalWork.includes(option.id)
                              ? 'bg-purple-500 border-purple-500 text-white'
                              : 'border-gray-300'
                          }`}>
                            {formData.additionalWork.includes(option.id) && (
                              <Check className="w-3 h-3" />
                            )}
                          </div>
                          <span className="font-medium text-gray-900">{option.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Create Labor Order */}
          {currentStepData.id === 'laborOrder' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Create Labor Order</h3>
                <p className="text-sm text-gray-500">Select labor items for {formData.workType || 'this work order'}</p>
              </div>

              {/* Labor Categories Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
                {['Gold Pledge Installation', 'Siding Installation', 'Gutter Installation', 'General'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveLaborCategory(cat)}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
                      activeLaborCategory === cat
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search labor items..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              {/* Labor Items */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {formData.laborItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border-2 transition ${
                      item.selected ? 'border-green-500 bg-green-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleLaborItemToggle(item)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                          item.selected
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {item.selected && <Check className="w-3 h-3" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{item.productName}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500">{item.description}</p>
                        )}
                      </div>

                      {item.selected && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleLaborQuantityChange(item.productName, (item.quantity || 1) - 1)}
                            className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            value={item.quantity || 1}
                            onChange={(e) => handleLaborQuantityChange(item.productName, parseFloat(e.target.value) || 1)}
                            className="w-16 h-7 text-center border rounded-lg text-sm"
                          />
                          <button
                            onClick={() => handleLaborQuantityChange(item.productName, (item.quantity || 1) + 1)}
                            className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          ${(item.unitPrice || item.listPrice || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">{item.uom}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {formData.laborItems.length === 0 && (
                  <div className="text-center py-8">
                    <DollarSign className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">No labor items loaded</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Select a work type to load default labor items
                    </p>
                  </div>
                )}
              </div>

              {/* Labor Total */}
              {formData.laborItems.some(l => l.selected) && (
                <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-green-800">Labor Total:</span>
                    <span className="text-xl font-bold text-green-700">${laborTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 7: Review & Finish */}
          {currentStepData.id === 'review' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Review & Submit</h3>
                <p className="text-sm text-gray-500">Review your orders before submitting</p>
              </div>

              {/* Summary Cards */}
              <div className="space-y-4">
                {/* Template */}
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">Order Template</span>
                  </div>
                  <p className="text-gray-700">
                    {formData.selectedTemplate?.name || 'No template selected'}
                  </p>
                </div>

                {/* Material Order */}
                <div className="p-4 bg-blue-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-blue-900">Material Order</span>
                    </div>
                    <span className="text-lg font-bold text-blue-700">${materialTotal.toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-blue-700">
                    {formData.selectedMaterials.length} item(s) selected
                  </p>
                </div>

                {/* Work Order */}
                <div className="p-4 bg-purple-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="w-5 h-5 text-purple-600" />
                    <span className="font-medium text-purple-900">Work Order</span>
                  </div>
                  <p className="text-purple-700">{formData.workType || 'No work type selected'}</p>
                  {formData.additionalWork.length > 0 && (
                    <p className="text-sm text-purple-600 mt-1">
                      + {formData.additionalWork.map(w =>
                        ADDITIONAL_WORK_OPTIONS.find(o => o.id === w)?.label
                      ).join(', ')}
                    </p>
                  )}
                </div>

                {/* Labor Order */}
                <div className="p-4 bg-green-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-900">Labor Order</span>
                    </div>
                    <span className="text-lg font-bold text-green-700">${laborTotal.toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-green-700">
                    {formData.laborItems.filter(l => l.selected).length} labor item(s) selected
                  </p>
                </div>

                {/* Grand Total */}
                <div className="p-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl text-white">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Grand Total</span>
                    <span className="text-2xl font-bold">${(materialTotal + laborTotal).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Submit Note */}
              <div className="p-4 bg-gray-100 rounded-xl text-center">
                <p className="text-sm text-gray-600">
                  Navigate to the Production tab to manage work order & submit material order
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={currentStep === 0 ? onClose : goToPreviousStep}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition"
          >
            <ChevronLeft className="w-4 h-4" />
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </button>

          <div className="flex items-center gap-2">
            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={goToNextStep}
                disabled={!isStepComplete(currentStep)}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <Check className="w-4 h-4" />
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Measurement Field Component
function MeasurementField({ label, value, unit, onChange }) {
  return (
    <div className="p-3 bg-white rounded-xl border border-gray-200">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-lg font-semibold text-gray-900 bg-transparent focus:outline-none"
          placeholder="0"
        />
        <span className="text-sm font-medium text-gray-500">{unit}</span>
      </div>
    </div>
  );
}
