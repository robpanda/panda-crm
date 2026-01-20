import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { FileSignature, Plus, Search, Filter, Calendar, Building2, DollarSign } from 'lucide-react';

export default function ContractsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <AdminLayout
      title="Contracts"
      icon={FileSignature}
      description="Manage contracts and agreements"
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search contracts..."
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
            New Contract
          </button>
        </div>

        {/* Contracts List - Placeholder */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <FileSignature className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Contracts Management</p>
            <p className="text-sm">Contract management features coming soon</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
