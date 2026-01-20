import { useState, useEffect } from 'react';
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
} from 'lucide-react';

/**
 * ChangeOrderModal - Process price change/change order workflow
 * Based on Scribehow documentation: Processing_a_Pricechange_change_order
 *
 * Workflow:
 * 1. Select upgrade products to add
 * 2. Enter quantities and prices
 * 3. Review original contract amount vs. amendment amount
 * 4. Generate and send Change Order document for signature
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
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1); // 1: Select Products, 2: Review & Send
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [changeDescription, setChangeDescription] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(['roofing']);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

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
    }
  }, [isOpen]);

  // Create change order mutation
  const createChangeOrderMutation = useMutation({
    mutationFn: async () => {
      // Get recipient info
      const recipientName = contact?.firstName
        ? `${contact.firstName} ${contact.lastName || ''}`.trim()
        : opportunity?.contact?.firstName
          ? `${opportunity.contact.firstName} ${opportunity.contact.lastName || ''}`.trim()
          : account?.name || opportunity?.account?.name;

      const recipientEmail = contact?.email || opportunity?.contact?.email || account?.email || opportunity?.account?.email;

      // Create change order via dedicated endpoint (handles agreement creation + opportunity update)
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
        sendImmediately: true,
      });

      return result;
    },
    onSuccess: (data) => {
      setSuccess('Change Order sent successfully!');
      queryClient.invalidateQueries(['opportunity', opportunity.id]);
      queryClient.invalidateQueries(['opportunityDocuments', opportunity.id]);
      if (onSuccess) onSuccess(data);
      setTimeout(() => {
        onClose();
      }, 2000);
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create change order');
    },
  });

  // Add product to selection
  const addProduct = (product) => {
    const existing = selectedProducts.find(p => p.id === product.id);
    if (existing) {
      // Increment quantity
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl transform transition-all max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Process Change Order</h2>
                <p className="text-sm text-gray-500">
                  {step === 1 ? 'Select upgrade products' : 'Review and send for signature'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step Indicator */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 ${step >= 1 ? 'text-panda-primary' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= 1 ? 'bg-panda-primary text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > 1 ? <CheckCircle className="w-5 h-5" /> : '1'}
                </div>
                <span className="text-sm font-medium">Select Products</span>
              </div>
              <div className="flex-1 h-0.5 bg-gray-200">
                <div className={`h-full bg-panda-primary transition-all ${step >= 2 ? 'w-full' : 'w-0'}`} />
              </div>
              <div className={`flex items-center space-x-2 ${step >= 2 ? 'text-panda-primary' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= 2 ? 'bg-panda-primary text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  2
                </div>
                <span className="text-sm font-medium">Review & Send</span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Step 1: Select Products */}
            {step === 1 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Product Selection */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Upgrades Pricebook</h3>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search products..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {filteredCategories.map((category) => (
                      <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleCategory(category.id)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <span className="font-medium text-gray-700">{category.name}</span>
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
                                className="flex items-center justify-between px-4 py-2 hover:bg-gray-50"
                              >
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{product.name}</p>
                                  <p className="text-xs text-gray-500">
                                    ${product.unitPrice.toFixed(2)} / {product.unit}
                                  </p>
                                </div>
                                <button
                                  onClick={() => addProduct(product)}
                                  className="p-1.5 text-panda-primary hover:bg-panda-primary/10 rounded-lg transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
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
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Selected Items ({selectedProducts.length})</h3>

                  {selectedProducts.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                      <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No items selected</p>
                      <p className="text-sm text-gray-400">Click + to add upgrade products</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                      {selectedProducts.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                            <div className="flex items-center space-x-3 mt-1">
                              <div className="flex items-center space-x-1">
                                <span className="text-xs text-gray-500">Qty:</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={product.quantity}
                                  onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-panda-primary"
                                />
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="text-xs text-gray-500">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={product.unitPrice}
                                  onChange={(e) => updatePrice(product.id, e.target.value)}
                                  className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-panda-primary"
                                />
                                <span className="text-xs text-gray-500">/{product.unit}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3 ml-3">
                            <span className="text-sm font-semibold text-gray-900">
                              ${(product.quantity * product.unitPrice).toFixed(2)}
                            </span>
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Totals Summary */}
                  <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Original Contract:</span>
                        <span className="font-medium">${originalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Amendment Amount:</span>
                        <span className="font-medium text-orange-600">+${amendmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="border-t border-orange-200 pt-2 mt-2">
                        <div className="flex justify-between">
                          <span className="font-semibold text-gray-900">New Contract Total:</span>
                          <span className="font-bold text-lg text-panda-primary">${newTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Review & Send */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Contract Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Original Amount</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${originalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg text-center">
                    <p className="text-xs text-orange-600 uppercase tracking-wide mb-1">Amendment</p>
                    <p className="text-2xl font-bold text-orange-600">
                      +${amendmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-xs text-green-600 uppercase tracking-wide mb-1">New Total</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${newTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Line Items Review */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h4 className="font-medium text-gray-900">Change Order Items</h4>
                  </div>
                  <table className="w-full">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Description</th>
                        <th className="px-4 py-2 text-right">Qty</th>
                        <th className="px-4 py-2 text-right">Unit Price</th>
                        <th className="px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedProducts.map((product) => (
                        <tr key={product.id}>
                          <td className="px-4 py-3 text-sm text-gray-900">{product.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">{product.quantity} {product.unit}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">${product.unitPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                            ${(product.quantity * product.unitPrice).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                          Amendment Total:
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-orange-600 text-right">
                          ${amendmentAmount.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Description of Changes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description of Changes <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={changeDescription}
                    onChange={(e) => setChangeDescription(e.target.value)}
                    placeholder="Describe the changes being made to the original contract..."
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  />
                </div>

                {/* Recipient Info */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2">Change Order will be sent to:</h4>
                  <p className="text-sm text-blue-800">
                    <strong>
                      {opportunity.contact?.firstName
                        ? `${opportunity.contact.firstName} ${opportunity.contact.lastName || ''}`.trim()
                        : opportunity.account?.name}
                    </strong>
                    {' '}({opportunity.contact?.email || opportunity.account?.email || 'No email'})
                  </p>
                </div>

                {/* Error/Success Messages */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-700">{success}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between flex-shrink-0">
            {step === 1 ? (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={selectedProducts.length === 0}
                  className="inline-flex items-center px-6 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  Next: Review
                  <ChevronDown className="w-4 h-4 ml-2 rotate-[-90deg]" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => createChangeOrderMutation.mutate()}
                  disabled={!changeDescription || createChangeOrderMutation.isPending || success}
                  className="inline-flex items-center px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {createChangeOrderMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Change Order
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
