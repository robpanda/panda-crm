import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { FileText, Plus, Search, Filter, DollarSign, Calendar, Building2 } from 'lucide-react';
import { quotesApi } from '../../services/api';

export default function QuotesPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => quotesApi.getQuotes({ limit: 50 }),
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  return (
    <AdminLayout
      title="Quotes"
      icon={FileText}
      description="Manage quotes and proposals"
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search quotes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button className="flex items-center gap-2 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            New Quote
          </button>
        </div>

        {/* Quotes List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : quotes?.data?.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {quotes.data.map((quote) => (
                <div key={quote.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{quote.name || quote.quoteNumber}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {quote.account && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            {quote.account.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          {formatCurrency(quote.totalAmount)}
                        </span>
                        {quote.expirationDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Expires: {new Date(quote.expirationDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      quote.status === 'accepted' ? 'bg-green-100 text-green-700' :
                      quote.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                      quote.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {quote.status || 'draft'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <FileText className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No quotes found</p>
              <p className="text-sm">Create a new quote to get started</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
