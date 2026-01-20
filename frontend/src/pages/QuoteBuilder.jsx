import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Search, Save, Check, X,
  Package, Copy, AlertCircle, Building2, User, Calendar, GripVertical
} from 'lucide-react';
import { quotesApi, productsApi, priceBooksApi, opportunitiesApi } from '../services/api';

// Status colors
const statusColors = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  VIEWED: 'bg-yellow-100 text-yellow-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-orange-100 text-orange-700',
};

// Product family colors
const familyColors = {
  // Standard categories
  'Roofing': 'bg-blue-50 border-blue-200',
  'Siding': 'bg-green-50 border-green-200',
  'Gutters': 'bg-purple-50 border-purple-200',
  'Windows': 'bg-cyan-50 border-cyan-200',
  'Labor': 'bg-orange-50 border-orange-200',
  'Materials': 'bg-yellow-50 border-yellow-200',
  'Other': 'bg-gray-50 border-gray-200',
  // Insurance-specific categories (RCV = Replacement Cost Value)
  'Roof RCV': 'bg-sky-50 border-sky-200',
  'Siding RCV': 'bg-emerald-50 border-emerald-200',
  'Gutters RCV': 'bg-violet-50 border-violet-200',
  'Interior RCV': 'bg-rose-50 border-rose-200',
  'Deductible': 'bg-amber-50 border-amber-200',
  'Depreciation': 'bg-slate-50 border-slate-200',
  'Supplements': 'bg-indigo-50 border-indigo-200',
  'ACV': 'bg-teal-50 border-teal-200', // Actual Cash Value
};

export default function QuoteBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const opportunityId = searchParams.get('opportunityId');

  const isNew = !id || id === 'new';

  // Quote state
  const [quote, setQuote] = useState({
    name: '',
    opportunityId: opportunityId || '',
    pricebookId: '',
    expirationDate: '',
    lineItems: [],
    subtotal: 0,
    discount: 0,
    discountType: 'fixed', // 'fixed' or 'percent'
    tax: 0,
    taxRate: 0,
    total: 0,
  });

  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Product selection
  const [products, setProducts] = useState([]);
  const [productFamilies, setProductFamilies] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('all');

  // Pricebooks
  const [pricebooks, setPricebooks] = useState([]);

  // Opportunity
  const [opportunity, setOpportunity] = useState(null);

  // Edit state for line items
  const [editingLineId, setEditingLineId] = useState(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [id, opportunityId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load products, pricebooks, and families
      const [productsRes, pricebooksRes, familiesRes] = await Promise.all([
        productsApi.getProducts({ isActive: true, limit: 500 }),
        priceBooksApi.getPriceBooks({ isActive: true }),
        productsApi.getProductFamilies().catch(() => []),
      ]);

      setProducts(productsRes?.data || []);
      setPricebooks(pricebooksRes?.data || []);
      setProductFamilies(familiesRes || []);

      // Load opportunity if provided
      if (opportunityId) {
        const opp = await opportunitiesApi.getOpportunity(opportunityId);
        setOpportunity(opp);
        if (isNew) {
          setQuote(prev => ({
            ...prev,
            name: `Quote for ${opp.name}`,
            opportunityId: opp.id,
          }));
        }
      }

      // Load existing quote
      if (!isNew) {
        const quoteData = await quotesApi.getQuote(id);
        setQuote({
          ...quoteData,
          discountType: 'fixed',
          taxRate: 0,
        });
        if (quoteData.opportunity) {
          setOpportunity(quoteData.opportunity);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const calculateTotals = useCallback((lineItems, discount = 0, discountType = 'fixed', taxRate = 0) => {
    const subtotal = lineItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

    let discountAmount = discountType === 'percent'
      ? subtotal * (discount / 100)
      : discount;

    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * (taxRate / 100);
    const total = taxableAmount + taxAmount;

    return { subtotal, discount: discountAmount, tax: taxAmount, total };
  }, []);

  // Add product to quote
  const addProduct = (product) => {
    const newLine = {
      id: `temp-${Date.now()}`,
      productId: product.id,
      product,
      description: product.description || product.name,
      quantity: 1,
      unitPrice: parseFloat(product.unitPrice) || 0,
      discount: 0,
      totalPrice: parseFloat(product.unitPrice) || 0,
      sortOrder: quote.lineItems.length,
    };

    const newLineItems = [...quote.lineItems, newLine];
    const totals = calculateTotals(newLineItems, quote.discount, quote.discountType, quote.taxRate);

    setQuote(prev => ({
      ...prev,
      lineItems: newLineItems,
      ...totals,
    }));

    setShowProductSearch(false);
    setProductSearch('');
  };

  // Update line item
  const updateLineItem = (lineId, field, value) => {
    const newLineItems = quote.lineItems.map(item => {
      if (item.id === lineId) {
        const updated = { ...item, [field]: value };

        // Recalculate line total
        if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
          const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(updated.quantity) || 0;
          const price = field === 'unitPrice' ? parseFloat(value) || 0 : parseFloat(updated.unitPrice) || 0;
          const disc = field === 'discount' ? parseFloat(value) || 0 : parseFloat(updated.discount) || 0;
          updated.totalPrice = (qty * price) - disc;
        }

        return updated;
      }
      return item;
    });

    const totals = calculateTotals(newLineItems, quote.discount, quote.discountType, quote.taxRate);
    setQuote(prev => ({ ...prev, lineItems: newLineItems, ...totals }));
  };

  // Remove line item
  const removeLineItem = (lineId) => {
    const newLineItems = quote.lineItems.filter(item => item.id !== lineId);
    const totals = calculateTotals(newLineItems, quote.discount, quote.discountType, quote.taxRate);
    setQuote(prev => ({ ...prev, lineItems: newLineItems, ...totals }));
  };

  // Update quote-level discount
  const updateDiscount = (value, type = quote.discountType) => {
    const totals = calculateTotals(quote.lineItems, parseFloat(value) || 0, type, quote.taxRate);
    setQuote(prev => ({
      ...prev,
      discount: parseFloat(value) || 0,
      discountType: type,
      ...totals,
    }));
  };

  // Update tax rate
  const updateTaxRate = (value) => {
    const totals = calculateTotals(quote.lineItems, quote.discount, quote.discountType, parseFloat(value) || 0);
    setQuote(prev => ({
      ...prev,
      taxRate: parseFloat(value) || 0,
      ...totals,
    }));
  };

  // Save quote
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: quote.name,
        opportunityId: quote.opportunityId,
        pricebookId: quote.pricebookId || null,
        expirationDate: quote.expirationDate || null,
        subtotal: quote.subtotal,
        discount: quote.discount,
        tax: quote.tax,
        total: quote.total,
        lineItems: quote.lineItems.map((item, index) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          totalPrice: item.totalPrice,
          sortOrder: index,
        })),
      };

      if (isNew) {
        const created = await quotesApi.createQuote(payload);
        navigate(`/quotes/${created.id}`, { replace: true });
      } else {
        await quotesApi.updateQuote(id, payload);
      }
    } catch (err) {
      console.error('Error saving quote:', err);
      setError(err.message || 'Failed to save quote');
    } finally {
      setSaving(false);
    }
  };

  // Accept quote and convert to contract
  const handleAcceptQuote = async () => {
    try {
      const result = await quotesApi.acceptQuote(id);
      // After accepting, navigate back to the job with the new service contract
      navigate(`/jobs/${quote.opportunityId}`);
    } catch (err) {
      setError(err.message || 'Failed to accept quote');
    }
  };

  // Clone quote
  const handleCloneQuote = async () => {
    try {
      const cloned = await quotesApi.cloneQuote(id);
      navigate(`/quotes/${cloned.id}`);
    } catch (err) {
      setError(err.message || 'Failed to clone quote');
    }
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = !productSearch ||
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.productCode?.toLowerCase().includes(productSearch.toLowerCase());
    const matchesFamily = selectedFamily === 'all' || p.family === selectedFamily;
    return matchesSearch && matchesFamily;
  });

  // Group line items by family for display
  const lineItemsByFamily = quote.lineItems.reduce((acc, item) => {
    const family = item.product?.family || 'Other';
    if (!acc[family]) acc[family] = [];
    acc[family].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to={opportunity ? `/jobs/${opportunity.id}` : '/jobs'} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? 'New Quote' : quote.quoteNumber || 'Quote Builder'}
            </h1>
            <p className="text-gray-500">
              {opportunity ? `For ${opportunity.name}` : 'Create a detailed quote with products and pricing'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {!isNew && quote.status === 'DRAFT' && (
            <button
              onClick={handleAcceptQuote}
              className="flex items-center space-x-2 px-4 py-2 border border-green-600 text-green-600 rounded-lg hover:bg-green-50"
            >
              <Check className="w-4 h-4" />
              <span>Accept & Create Contract</span>
            </button>
          )}
          {!isNew && (
            <button
              onClick={handleCloneQuote}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <Copy className="w-4 h-4" />
              <span>Clone</span>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Quote'}</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Line Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quote Details Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quote Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quote Name</label>
                <input
                  type="text"
                  value={quote.name}
                  onChange={(e) => setQuote(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="Enter quote name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price Book</label>
                <select
                  value={quote.pricebookId || ''}
                  onChange={(e) => setQuote(prev => ({ ...prev, pricebookId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                >
                  <option value="">Standard Price Book</option>
                  {pricebooks.map(pb => (
                    <option key={pb.id} value={pb.id}>{pb.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
                <input
                  type="date"
                  value={quote.expirationDate ? quote.expirationDate.split('T')[0] : ''}
                  onChange={(e) => setQuote(prev => ({ ...prev, expirationDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <span className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium ${statusColors[quote.status] || statusColors.DRAFT}`}>
                  {quote.status || 'DRAFT'}
                </span>
              </div>
            </div>
          </div>

          {/* Line Items Card */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Line Items ({quote.lineItems.length})
              </h2>
              <button
                onClick={() => setShowProductSearch(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
            </div>

            {/* Line Items List */}
            <div className="divide-y divide-gray-100">
              {Object.entries(lineItemsByFamily).map(([family, items]) => (
                <div key={family} className={`${familyColors[family] || familyColors.Other} border-l-4`}>
                  <div className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50/50">
                    {family} ({items.length})
                  </div>
                  {items.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-white/50 transition-colors">
                      <div className="flex items-start space-x-4">
                        <div className="cursor-move text-gray-400 pt-2">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900">{item.product?.name || item.description}</span>
                            {item.product?.productCode && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                {item.product.productCode}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1 truncate">{item.description}</p>
                        </div>
                        <div className="flex items-center space-x-4">
                          {/* Quantity */}
                          <div className="w-20">
                            <label className="block text-xs text-gray-500 mb-1">Qty</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(item.id, 'quantity', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-panda-primary"
                              min="1"
                              step="any"
                            />
                          </div>
                          {/* Unit Price */}
                          <div className="w-28">
                            <label className="block text-xs text-gray-500 mb-1">Unit Price</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input
                                type="number"
                                value={item.unitPrice}
                                onChange={(e) => updateLineItem(item.id, 'unitPrice', e.target.value)}
                                className="w-full pl-6 pr-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-panda-primary"
                                step="0.01"
                              />
                            </div>
                          </div>
                          {/* Line Discount */}
                          <div className="w-24">
                            <label className="block text-xs text-gray-500 mb-1">Discount</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input
                                type="number"
                                value={item.discount || 0}
                                onChange={(e) => updateLineItem(item.id, 'discount', e.target.value)}
                                className="w-full pl-6 pr-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-panda-primary"
                                step="0.01"
                              />
                            </div>
                          </div>
                          {/* Total */}
                          <div className="w-28 text-right">
                            <label className="block text-xs text-gray-500 mb-1">Total</label>
                            <span className="font-semibold text-gray-900">${item.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          {/* Delete */}
                          <button
                            onClick={() => removeLineItem(item.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {quote.lineItems.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-lg font-medium text-gray-900">No products added</p>
                  <p className="mt-1">Click "Add Product" to start building your quote</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Summary */}
        <div className="space-y-6">
          {/* Job Info */}
          {opportunity && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Job Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center text-gray-600">
                  <Building2 className="w-4 h-4 mr-2" />
                  <span>{opportunity.account?.name}</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <User className="w-4 h-4 mr-2" />
                  <span>{opportunity.contact?.firstName} {opportunity.contact?.lastName}</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <Calendar className="w-4 h-4 mr-2" />
                  <span>Created {new Date(opportunity.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Totals Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Quote Summary</h3>
            <div className="space-y-3">
              {/* Subtotal */}
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${quote.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {/* Discount */}
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Discount</span>
                <div className="flex items-center space-x-2">
                  <select
                    value={quote.discountType}
                    onChange={(e) => updateDiscount(quote.discount, e.target.value)}
                    className="text-sm border border-gray-200 rounded px-2 py-1"
                  >
                    <option value="fixed">$</option>
                    <option value="percent">%</option>
                  </select>
                  <input
                    type="number"
                    value={quote.discount}
                    onChange={(e) => updateDiscount(e.target.value, quote.discountType)}
                    className="w-20 px-2 py-1 text-sm text-right border border-gray-200 rounded"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Tax */}
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Tax Rate</span>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    value={quote.taxRate}
                    onChange={(e) => updateTaxRate(e.target.value)}
                    className="w-16 px-2 py-1 text-sm text-right border border-gray-200 rounded"
                    min="0"
                    step="0.01"
                  />
                  <span className="text-gray-400">%</span>
                </div>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax Amount</span>
                <span>${quote.tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {/* Total */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-green-600">${quote.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Draft'}</span>
              </button>
              {!isNew && (
                <button
                  onClick={handleCloneQuote}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  <Copy className="w-4 h-4" />
                  <span>Duplicate Quote</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Product Search Modal */}
      {showProductSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Add Products</h2>
                <button onClick={() => setShowProductSearch(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="flex space-x-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                    autoFocus
                  />
                </div>
                <select
                  value={selectedFamily}
                  onChange={(e) => setSelectedFamily(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                >
                  <option value="all">All Categories</option>
                  {productFamilies.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredProducts.slice(0, 50).map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className={`p-4 text-left rounded-lg border hover:shadow-md transition-shadow ${familyColors[product.family] || familyColors.Other}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{product.name}</p>
                          {product.productCode && (
                            <p className="text-xs text-gray-500 mt-0.5">{product.productCode}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1 truncate">{product.description || product.family}</p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="font-semibold text-gray-900">${parseFloat(product.unitPrice || 0).toFixed(2)}</p>
                          <p className="text-xs text-gray-500">{product.family}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-end">
                        <Plus className="w-4 h-4 text-panda-primary" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
