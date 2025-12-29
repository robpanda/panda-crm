import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { priceBooksApi } from '../services/api';
import {
  BookOpen,
  ChevronRight,
  Star,
  Package,
} from 'lucide-react';
import SubNav from '../components/SubNav';

export default function PriceBooks() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pricebooks', { search, page, activeTab }],
    queryFn: () => priceBooksApi.getPriceBooks({
      search,
      page,
      limit: 25,
      isActive: activeTab === 'active' ? true : activeTab === 'inactive' ? false : undefined,
      isStandard: activeTab === 'standard' ? true : undefined,
    }),
  });

  const pricebooks = data?.data || [];
  const pagination = data?.pagination || {};

  // Tabs for SubNav
  const tabs = [
    { id: 'all', label: 'All', count: pagination.total || 0 },
    { id: 'active', label: 'Active', count: null },
    { id: 'standard', label: 'Standard', count: null },
    { id: 'inactive', label: 'Inactive', count: null },
  ];

  return (
    <div className="space-y-6">
      {/* Sub Navigation */}
      <SubNav
        entity="Price Book"
        basePath="/pricebooks"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setPage(1); }}
        showNewButton={false}
        searchValue={search}
        onSearch={(s) => { setSearch(s); setPage(1); }}
        showSearch={true}
      />

      {/* Price Books List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <BookOpen className="w-12 h-12 mb-2 text-gray-300" />
            <p className="text-red-500">Error loading price books</p>
            <p className="text-sm text-gray-400">{error.message}</p>
          </div>
        ) : pricebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <BookOpen className="w-12 h-12 mb-2 text-gray-300" />
            <p>No price books found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pricebooks.map((pricebook) => (
              <Link
                key={pricebook.id}
                to={`/pricebooks/${pricebook.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    pricebook.isStandard
                      ? 'bg-gradient-to-br from-yellow-400 to-orange-500'
                      : 'bg-gradient-to-br from-panda-primary to-panda-secondary'
                  }`}>
                    {pricebook.isStandard ? (
                      <Star className="w-5 h-5 text-white" />
                    ) : (
                      <BookOpen className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 flex items-center">
                      {pricebook.name}
                      {pricebook.isStandard && (
                        <span className="ml-2 text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                          Standard
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      {pricebook.description && (
                        <span className="truncate max-w-xs">{pricebook.description}</span>
                      )}
                      {pricebook._count?.entries > 0 && (
                        <span className="flex items-center">
                          <Package className="w-3 h-3 mr-1" />
                          {pricebook._count.entries} products
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className={`badge ${
                    pricebook.isActive ? 'badge-success' : 'badge-gray'
                  }`}>
                    {pricebook.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
