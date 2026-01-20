import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { priceBooksApi } from '../services/api';
import {
  BookOpen,
  ArrowLeft,
  Star,
  Package,
  Search,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function PriceBookDetail() {
  const { id } = useParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedFamily, setSelectedFamily] = useState('');

  const { data: pricebook, isLoading: loadingPricebook } = useQuery({
    queryKey: ['pricebook', id],
    queryFn: () => priceBooksApi.getPriceBook(id),
    enabled: !!id,
  });

  const { data: entriesData, isLoading: loadingEntries } = useQuery({
    queryKey: ['pricebook-entries', id, { search, page, family: selectedFamily }],
    queryFn: () => priceBooksApi.getEntries(id, {
      search,
      page,
      limit: 50,
      family: selectedFamily || undefined,
    }),
    enabled: !!id,
  });

  const entries = entriesData?.data || [];
  const pagination = entriesData?.pagination || {};

  // Extract unique families from entries for filter
  const families = [...new Set(entries.map(e => e.product?.family).filter(Boolean))].sort();

  if (loadingPricebook) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!pricebook) {
    return (
      <div className="text-center py-12">
        <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Price book not found</p>
        <Link to="/pricebooks" className="text-panda-primary hover:underline mt-2 inline-block">
          Back to Price Books
        </Link>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    if (amount == null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link to="/pricebooks" className="inline-flex items-center text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Price Books
      </Link>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
              pricebook.isStandard
                ? 'bg-gradient-to-br from-yellow-400 to-orange-500'
                : 'bg-gradient-to-br from-panda-primary to-panda-secondary'
            }`}>
              {pricebook.isStandard ? (
                <Star className="w-8 h-8 text-white" />
              ) : (
                <BookOpen className="w-8 h-8 text-white" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                {pricebook.name}
                {pricebook.isStandard && (
                  <span className="ml-3 text-sm px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full">
                    Standard Price Book
                  </span>
                )}
              </h1>
              {pricebook.description && (
                <p className="text-gray-500 mt-1">{pricebook.description}</p>
              )}
              <div className="flex items-center space-x-6 mt-3 text-sm text-gray-500">
                <span className="flex items-center">
                  <Package className="w-4 h-4 mr-1" />
                  {pagination.total || 0} products
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`badge ${
              pricebook.isActive ? 'badge-success' : 'badge-gray'
            }`}>
              {pricebook.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Products/Entries Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* Search and Filters */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              />
            </div>
            {families.length > 0 && (
              <select
                value={selectedFamily}
                onChange={(e) => { setSelectedFamily(e.target.value); setPage(1); }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              >
                <option value="">All Families</option>
                {families.map((family) => (
                  <option key={family} value={family}>{family}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Entries Table */}
        {loadingEntries ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : entries.length === 0 ? (
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
                      Unit Price
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-500" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{entry.product?.name || 'Unknown Product'}</p>
                            {entry.product?.description && (
                              <p className="text-xs text-gray-500 truncate max-w-xs">{entry.product.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {entry.product?.productCode || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {entry.product?.family && (
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                            {entry.product.family}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-gray-900">
                          {formatCurrency(entry.unitPrice)}
                        </span>
                        {entry.useStandardPrice && (
                          <span className="ml-2 text-xs text-gray-400">(std)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${entry.isActive ? 'badge-success' : 'badge-gray'}`}>
                          {entry.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {entries.map((entry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{entry.product?.name || 'Unknown Product'}</p>
                        <p className="text-sm text-gray-500">{entry.product?.productCode || 'No code'}</p>
                        {entry.product?.family && (
                          <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            {entry.product.family}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{formatCurrency(entry.unitPrice)}</p>
                      <span className={`badge ${entry.isActive ? 'badge-success' : 'badge-gray'}`}>
                        {entry.isActive ? 'Active' : 'Inactive'}
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
              Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, pagination.total)} of {pagination.total}
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
                Page {page} of {pagination.totalPages}
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
