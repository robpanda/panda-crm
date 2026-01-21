import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quotesApi, agreementsApi, opportunitiesApi } from '../services/api';
import {
  X,
  FileText,
  DollarSign,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Send,
  Package,
  Search,
  ChevronDown,
  ChevronUp,
  Pen,
  RotateCcw,
  User,
  ArrowRight,
} from 'lucide-react';

/**
 * ChangeOrderModal - Mobile-first change order workflow with touch-friendly signing
 * Based on Scribehow documentation: Change_Order_Process
 *
 * Workflow:
 * 1. Select upgrade products to add
 * 2. Review original contract amount vs. amendment amount
 * 3. Agent signs as "Authorized Agent" (in-person, touch-friendly)
 * 4. Send to customer for remote signature
 * 5. Case auto-created when sent, auto-resolved when fully signed
 */

// Pricebook options - matches Salesforce Upgrades Pricebook
const UPGRADE_CATEGORIES = [
  { id: 'roofing', name: 'Roofing Upgrades', products: [
    { id: 'upgrade-timberline-hdz', name: 'GAF Timberline HDZ Upgrade', unitPrice: 150, unit: 'sq' },
    { id: 'upgrade-timberline-uhdz', name: 'GAF Timberline UHDZ Upgrade', unitPrice: 250, unit: 'sq' },
    { id: 'upgrade-timbersteel', name: 'GAF TimberSteel Upgrade', unitPrice: 450, unit: 'sq' },
    { id: 'upgrade-ridge-cap', name: 'Ridge Cap Upgrade', unitPrice: 15, unit: 'lf' },
    { id: 'upgrade-starter-strip', name: 'Pro-Start Starter Strip', unitPrice: 8, unit: 'lf' },
  ]},
  { id: 'ventilation', name: 'Ventilation Upgrades', products: [
    { id: 'upgrade-power-vent', name: 'Power Attic Ventilator', unitPrice: 450, unit: 'each' },
    { id: 'upgrade-solar-vent', name: 'Solar Powered Vent', unitPrice: 650, unit: 'each' },
    { id: 'upgrade-ridge-vent', name: 'Cobra Ridge Vent Upgrade', unitPrice: 12, unit: 'lf' },
    { id: 'upgrade-soffit-vent', name: 'Soffit Vents', unitPrice: 25, unit: 'each' },
  ]},
  { id: 'gutters', name: 'Gutter Upgrades', products: [
    { id: 'upgrade-gutter-guard', name: 'Gutter Guards', unitPrice: 18, unit: 'lf' },
    { id: 'upgrade-6in-gutter', name: '6" Seamless Gutters', unitPrice: 15, unit: 'lf' },
    { id: 'upgrade-downspout', name: 'Additional Downspout', unitPrice: 125, unit: 'each' },
  ]},
  { id: 'accessories', name: 'Accessories & Add-ons', products: [
    { id: 'upgrade-skylight', name: 'Skylight Installation', unitPrice: 1200, unit: 'each' },
    { id: 'upgrade-skylight-tube', name: 'Sun Tunnel Skylight', unitPrice: 750, unit: 'each' },
    { id: 'upgrade-chimney-cap', name: 'Chimney Cap', unitPrice: 350, unit: 'each' },
    { id: 'upgrade-drip-edge', name: 'Premium Drip Edge', unitPrice: 8, unit: 'lf' },
  ]},
  { id: 'warranty', name: 'Warranty Upgrades', products: [
    { id: 'upgrade-golden-pledge', name: 'GAF Golden Pledge Warranty', unitPrice: 500, unit: 'flat' },
    { id: 'upgrade-silver-pledge', name: 'GAF Silver Pledge Warranty', unitPrice: 250, unit: 'flat' },
    { id: 'upgrade-system-plus', name: 'System Plus Warranty', unitPrice: 150, unit: 'flat' },
  ]},
];

export default function ChangeOrderModal({
  isOpen,
  onClose,
  opportunity,
  contract,
  onSuccess,
  currentUser,
}) {
  const queryClient = useQueryClient();
  const canvasRef = useRef(null);

  // Steps: 1=Select Products, 2=Review, 3=Agent Sign, 4=Complete
  const [step, setStep] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [changeDescription, setChangeDescription] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(['roofing']);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Signature state
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState(null);

  // Calculate totals
  const originalAmount = parseFloat(contract?.contractTotal || opportunity?.contractTotal || opportunity?.amount || 0);
  const amendmentAmount = selectedProducts.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
  const newTotal = originalAmount + amendmentAmount;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedProducts([]);
      setChangeDescription('');
      setError(null);
      setSuccess(null);
      setSignatureData(null);
    }
  }, [isOpen]);

  // Initialize canvas when step 3 is shown
  useEffect(() => {
    if (step === 3 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Set canvas size for retina displays
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      // Drawing settings
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [step]);

  // Canvas drawing functions (touch-optimized)
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d');
    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // Save signature data
    const canvas = canvasRef.current;
    setSignatureData(canvas.toDataURL('image/png'));
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }
    setSignatureData(null);
  };

  // Create change order mutation (with agent signature)
  const createChangeOrderMutation = useMutation({
    mutationFn: async () => {
      // Get recipient info
      const recipientName = opportunity?.contact?.firstName
        ? `${opportunity.contact.firstName} ${opportunity.contact.lastName || ''}`.trim()
        : opportunity?.account?.name;

      const recipientEmail = opportunity?.contact?.email || opportunity?.account?.email;

      // Create change order via dedicated endpoint with agent signature
      const result = await agreementsApi.createChangeOrder(opportunity.id, {
        accountId: opportunity.accountId,
        recipientName,
        recipientEmail,
        originalAmount,
        amendmentAmount,
        newTotal,
        changeDescription,
        lineItems: selectedProducts.map(p => ({
          name: p.name,
          quantity: p.quantity,
          unit: p.unit,
          unitPrice: p.unitPrice,
        })),
        // Include agent signature data
        agentSignature: {
          signatureData,
          signerName: currentUser?.name || `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim(),
          signerEmail: currentUser?.email,
          role: 'Authorized Agent',
        },
        sendImmediately: true,
        createCase: true, // Trigger case creation
      });

      return result;
    },
    onSuccess: (data) => {
      setSuccess('Change Order signed and sent to customer!');
      queryClient.invalidateQueries(['opportunity', opportunity.id]);
      queryClient.invalidateQueries(['opportunityDocuments', opportunity.id]);
      if (onSuccess) onSuccess(data);
      setStep(4);
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create change order');
    },
  });

  // Add product to selection
  const addProduct = (product) => {
    const existing = selectedProducts.find(p => p.id === product.id);
    if (existing) {
      setSelectedProducts(prev =>
        prev.map(p => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p)
      );
    } else {
      setSelectedProducts(prev => [...prev, { ...product, quantity: 1 }]);
    }
  };

  // Update product quantity
  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      setSelectedProducts(prev => prev.filter(p => p.id !== productId));
    } else {
      setSelectedProducts(prev =>
        prev.map(p => p.id === productId ? { ...p, quantity } : p)
      );
    }
  };

  // Update product price
  const updatePrice = (productId, unitPrice) => {
    setSelectedProducts(prev =>
      prev.map(p => p.id === productId ? { ...p, unitPrice: parseFloat(unitPrice) || 0 } : p)
    );
  };

  // Remove product
  const removeProduct = (productId) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
  };

  // Toggle category expansion
  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Filter products by search
  const filteredCategories = UPGRADE_CATEGORIES.map(cat => ({
    ...cat,
    products: cat.products.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter(cat => cat.products.length > 0);

  if (!isOpen) return null;

  // Mobile-first bottom sheet styling
  const isMobile = window.innerWidth < 768;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal - Bottom sheet on mobile, centered on desktop */}
      <div className={`flex min-h-full ${isMobile ? 'items-end' : 'items-center'} justify-center ${isMobile ? '' : 'p-4'}`}>
        <div
          className={`relative w-full bg-white shadow-2xl transform transition-all flex flex-col ${
            isMobile
              ? 'rounded-t-2xl max-h-[95vh]'
              : 'rounded-xl max-w-4xl max-h-[90vh]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle for mobile */}
          {isMobile && (
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
          )}

          {/* Header */}
          <div className={`flex items-center justify-between px-4 ${isMobile ? 'py-3' : 'px-6 py-4'} border-b border-gray-200 flex-shrink-0`}>
            <div className="flex items-center space-x-3">
              <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center`}>
                <FileText className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-white`} />
              </div>
              <div>
                <h2 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-gray-900`}>
                  {step === 4 ? 'Change Order Sent!' : 'Process Change Order'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-500">
                  {step === 1 && 'Select upgrade products'}
                  {step === 2 && 'Review order details'}
                  {step === 3 && 'Sign as authorized agent'}
                  {step === 4 && 'Sent to customer for signature'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step Indicator */}
          {step < 4 && (
            <div className={`${isMobile ? 'px-4 py-2' : 'px-6 py-3'} bg-gray-50 border-b border-gray-200 flex-shrink-0`}>
              <div className="flex items-center justify-between">
                {[
                  { num: 1, label: 'Products' },
                  { num: 2, label: 'Review' },
                  { num: 3, label: 'Sign' },
                ].map((s, idx) => (
                  <div key={s.num} className="flex items-center">
                    <div className={`flex items-center ${idx > 0 ? 'flex-1' : ''}`}>
                      {idx > 0 && (
                        <div className={`h-0.5 w-8 sm:w-12 mx-1 ${step > s.num - 1 ? 'bg-panda-primary' : 'bg-gray-200'}`} />
                      )}
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${
                        step > s.num
                          ? 'bg-panda-primary text-white'
                          : step === s.num
                            ? 'bg-panda-primary text-white'
                            : 'bg-gray-200 text-gray-500'
                      }`}>
                        {step > s.num ? <CheckCircle className="w-4 h-4" /> : s.num}
                      </div>
                    </div>
                    <span className={`ml-1 text-xs hidden sm:inline ${step >= s.num ? 'text-panda-primary font-medium' : 'text-gray-400'}`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-4 py-4' : 'px-6 py-4'}`}>
            {/* Step 1: Select Products */}
            {step === 1 && (
              <div className={`${isMobile ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-6'}`}>
                {/* Product Selection */}
                <div className="space-y-3">
                  <div className={`flex items-center ${isMobile ? 'space-x-2' : 'justify-between'}`}>
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Upgrades Pricebook</h3>
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:w-auto pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                      />
                    </div>
                  </div>

                  <div className={`space-y-2 ${isMobile ? 'max-h-[250px]' : 'max-h-[400px]'} overflow-y-auto`}>
                    {filteredCategories.map((category) => (
                      <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleCategory(category.id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors touch-manipulation"
                        >
                          <span className="font-medium text-gray-700 text-sm">{category.name}</span>
                          {expandedCategories.includes(category.id) ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                        {expandedCategories.includes(category.id) && (
                          <div className="divide-y divide-gray-100">
                            {category.products.map((product) => (
                              <div
                                key={product.id}
                                className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 touch-manipulation"
                              >
                                <div className="flex-1 min-w-0 pr-2">
                                  <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                                  <p className="text-xs text-gray-500">
                                    ${product.unitPrice.toFixed(2)} / {product.unit}
                                  </p>
                                </div>
                                <button
                                  onClick={() => addProduct(product)}
                                  className="p-2 text-panda-primary hover:bg-panda-primary/10 rounded-lg transition-colors touch-manipulation"
                                >
                                  <Plus className="w-5 h-5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selected Products */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Selected Items ({selectedProducts.length})</h3>

                  {selectedProducts.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                      <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No items selected</p>
                      <p className="text-xs text-gray-400">Tap + to add products</p>
                    </div>
                  ) : (
                    <div className={`space-y-2 ${isMobile ? 'max-h-[200px]' : 'max-h-[300px]'} overflow-y-auto`}>
                      {selectedProducts.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <input
                                type="number"
                                min="1"
                                value={product.quantity}
                                onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 0)}
                                className="w-14 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-panda-primary touch-manipulation"
                              />
                              <span className="text-xs text-gray-500">×</span>
                              <div className="flex items-center">
                                <span className="text-xs text-gray-500">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={product.unitPrice}
                                  onChange={(e) => updatePrice(product.id, e.target.value)}
                                  className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-panda-primary touch-manipulation"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-2">
                            <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                              ${(product.quantity * product.unitPrice).toFixed(2)}
                            </span>
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded touch-manipulation"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Totals Summary - Always visible */}
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Original:</span>
                        <span className="font-medium">${originalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Amendment:</span>
                        <span className="font-medium text-orange-600">+${amendmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="border-t border-orange-200 pt-1.5 mt-1.5">
                        <div className="flex justify-between">
                          <span className="font-semibold text-gray-900">New Total:</span>
                          <span className="font-bold text-panda-primary">${newTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Review */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Contract Summary */}
                <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-3 gap-4'}`}>
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Original</p>
                    <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-gray-900`}>
                      ${originalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg text-center">
                    <p className="text-xs text-orange-600 uppercase tracking-wide mb-0.5">Amendment</p>
                    <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-orange-600`}>
                      +${amendmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <p className="text-xs text-green-600 uppercase tracking-wide mb-0.5">New Total</p>
                    <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-green-600`}>
                      ${newTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Line Items */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <h4 className="font-medium text-gray-900 text-sm">Change Order Items</h4>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-[200px] overflow-y-auto">
                    {selectedProducts.map((product) => (
                      <div key={product.id} className="flex justify-between px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.quantity} {product.unit} × ${product.unitPrice.toFixed(2)}</p>
                        </div>
                        <span className="text-sm font-medium text-gray-900 ml-2">
                          ${(product.quantity * product.unitPrice).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Description of Changes <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={changeDescription}
                    onChange={(e) => setChangeDescription(e.target.value)}
                    placeholder="Describe the changes being made..."
                    rows={isMobile ? 3 : 4}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary text-sm"
                  />
                </div>

                {/* Customer Info */}
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-900 text-sm mb-1">Sending to:</h4>
                  <p className="text-sm text-blue-800">
                    <strong>
                      {opportunity?.contact?.firstName
                        ? `${opportunity.contact.firstName} ${opportunity.contact.lastName || ''}`.trim()
                        : opportunity?.account?.name}
                    </strong>
                    <br />
                    <span className="text-xs">{opportunity?.contact?.email || opportunity?.account?.email || 'No email'}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Agent Sign */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Signer Info */}
                <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-panda-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-panda-primary" />
                  </div>
                  <div className="ml-3">
                    <p className="font-medium text-gray-900 text-sm">
                      {currentUser?.name || `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || 'Agent'}
                    </p>
                    <p className="text-xs text-gray-500">Signing as Authorized Agent</p>
                  </div>
                </div>

                {/* Order Summary Card */}
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-700">Amendment Amount:</span>
                    <span className="font-semibold text-orange-600">+${amendmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-900">New Contract Total:</span>
                    <span className="font-bold text-lg text-panda-primary">${newTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Signature Canvas */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">Draw Your Signature</h3>
                    <button
                      onClick={clearCanvas}
                      className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 touch-manipulation"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Clear
                    </button>
                  </div>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      style={{ width: '100%', height: isMobile ? '150px' : '180px' }}
                      className="cursor-crosshair touch-none"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Use your finger or stylus to sign above
                  </p>
                </div>

                {/* Legal Agreement */}
                <p className="text-xs text-gray-500 text-center px-4">
                  By tapping "Sign & Send", you confirm this signature is legally binding under the ESIGN Act.
                </p>

                {/* Error Message */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
                    <AlertCircle className="w-4 h-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Complete */}
            {step === 4 && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Change Order Sent!
                </h3>
                <p className="text-gray-500 text-sm mb-4 px-4">
                  Your signature has been applied. The change order has been sent to the customer for their signature.
                </p>

                {/* Summary */}
                <div className="p-4 bg-gray-50 rounded-lg text-left max-w-sm mx-auto">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Amendment:</span>
                      <span className="font-medium text-orange-600">+${amendmentAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">New Total:</span>
                      <span className="font-bold text-panda-primary">${newTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200">
                      <span className="text-gray-500">Sent to:</span>
                      <span className="font-medium">{opportunity?.contact?.email || opportunity?.account?.email}</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-400 mt-4">
                  A case has been created to track this change order.
                </p>
              </div>
            )}
          </div>

          {/* Footer - Sticky at bottom */}
          <div className={`${isMobile ? 'px-4 py-3' : 'px-6 py-4'} bg-gray-50 border-t border-gray-200 flex justify-between flex-shrink-0 safe-area-inset-bottom`}>
            {step === 1 && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={selectedProducts.length === 0}
                  className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all touch-manipulation"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!changeDescription}
                  className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all touch-manipulation"
                >
                  Next: Sign
                  <Pen className="w-4 h-4 ml-2" />
                </button>
              </>
            )}

            {step === 3 && (
              <>
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                >
                  Back
                </button>
                <button
                  onClick={() => createChangeOrderMutation.mutate()}
                  disabled={!signatureData || createChangeOrderMutation.isPending}
                  className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all touch-manipulation min-h-[44px]"
                >
                  {createChangeOrderMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Sign & Send
                    </>
                  )}
                </button>
              </>
            )}

            {step === 4 && (
              <button
                onClick={onClose}
                className="ml-auto px-6 py-2.5 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 touch-manipulation"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
