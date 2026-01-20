import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '../services/api';
import { formatNumber, formatCurrency } from '../utils/formatters';
import {
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  Tag,
} from 'lucide-react';
import SubNav from '../components/SubNav';

export default function Products() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedFamily, setSelectedFamily] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['products', { search, page, activeTab, family: selectedFamily }],
    queryFn: () => productsApi.getProducts({
      search,
      page,
      limit: 50,
      isActive: activeTab === 'active' ? true : activeTab === 'inactive' ? false : undefined,
      family: selectedFamily || undefined,
    }),
  });

  const products = data?.data || [];
  const pagination = data?.pagination || {};
  const families = data?.families || [];

  // Tabs for SubNav
  const tabs = [
    { id: 'all', label: 'All', count: pagination.total || 0 },
    { id: 'active', label: 'Active', count: null },
    { id: 'inactive', label: 'Inactive', count: null },
  ];


  return (
    <div className="space-y-6">
      {/* Sub Navigation */}
      <SubNav
        entity="Product"
        basePath="/products"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setPage(1); }}
        showNewButton={false}
        searchValue={search}
        onSearch={(s) => { setSearch(s); setPage(1); }}
        showSearch={true}
      />

      {/* Products List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* Family Filter */}
        {families.length > 0 && (
          <div className="p-4 border-b border-gray-100">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setSelectedFamily(''); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  !selectedFamily
                    ? 'bg-panda-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Families
              </button>
              {families.map((family) => (
                <button
                  key={family}
                  onClick={() => { setSelectedFamily(family); setPage(1); }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedFamily === family
                      ? 'bg-panda-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {family}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Package className="w-12 h-12 mb-2 text-gray-300" />
            <p className="text-red-500">Error loading products</p>
            <p className="text-sm text-gray-400">{error.message}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Package className="w-12 h-12 mb-2 text-gray-300" />
            <p>No products found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Family
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Base Price
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
                            <Package className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{product.name}</p>
                            {product.description && (
                              <p className="text-xs text-gray-500 truncate max-w-md">{product.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                        {product.productCode || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {product.family && (
                          <span className="inline-flex items-center text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                            <Tag className="w-3 h-3 mr-1" />
                            {product.family}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(product.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${product.isActive ? 'badge-success' : 'badge-gray'}`}>
                          {product.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {products.map((product) => (
                <div key={product.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{product.name}</p>
                        <p className="text-sm text-gray-500 font-mono">{product.productCode || 'No code'}</p>
                        {product.family && (
                          <span className="inline-flex items-center mt-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            <Tag className="w-3 h-3 mr-1" />
                            {product.family}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-gray-900">{formatCurrency(product.unitPrice)}</p>
                      <span className={`badge ${product.isActive ? 'badge-success' : 'badge-gray'}`}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {formatNumber(((page - 1) * 50) + 1)} to {formatNumber(Math.min(page * 50, pagination.total))} of {formatNumber(pagination.total)}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {formatNumber(page)} of {formatNumber(pagination.totalPages)}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.totalPages}
                className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
