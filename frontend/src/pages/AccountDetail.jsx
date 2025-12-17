import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '../services/api';
import {
  Building2,
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Globe,
  Calendar,
  DollarSign,
  Edit,
  Target,
  Users,
  FileText,
} from 'lucide-react';

export default function AccountDetail() {
  const { id } = useParams();

  const { data: account, isLoading } = useQuery({
    queryKey: ['account', id],
    queryFn: () => accountsApi.getAccount(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Account not found</p>
        <Link to="/accounts" className="text-panda-primary hover:underline mt-2 inline-block">
          Back to Accounts
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'opportunities', label: 'Opportunities', icon: Target, count: account._count?.opportunities || 0 },
    { id: 'contacts', label: 'Contacts', icon: Users, count: account._count?.contacts || 0 },
    { id: 'documents', label: 'Documents', icon: FileText, count: 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        to="/accounts"
        className="inline-flex items-center text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Accounts
      </Link>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
              <div className="flex items-center space-x-4 mt-2 text-gray-500">
                {account.billingStreet && (
                  <span className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {account.billingStreet}, {account.billingCity}, {account.billingState} {account.billingPostalCode}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4 mt-2">
                {account.phone && (
                  <a href={`tel:${account.phone}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Phone className="w-4 h-4 mr-1" />
                    {account.phone}
                  </a>
                )}
                {account.email && (
                  <a href={`mailto:${account.email}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Mail className="w-4 h-4 mr-1" />
                    {account.email}
                  </a>
                )}
                {account.website && (
                  <a href={account.website} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-panda-primary hover:underline">
                    <Globe className="w-4 h-4 mr-1" />
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`badge ${
              account.status === 'ACTIVE' ? 'badge-success' :
              account.status === 'PROSPECT' ? 'badge-info' :
              'badge-gray'
            }`}>
              {account.status}
            </span>
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              <Edit className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div>
            <p className="text-sm text-gray-500">Opportunities</p>
            <p className="text-xl font-semibold text-gray-900">{account._count?.opportunities || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Contacts</p>
            <p className="text-xl font-semibold text-gray-900">{account._count?.contacts || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-xl font-semibold text-green-600">
              ${(account.totalRevenue || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Customer Since</p>
            <p className="text-xl font-semibold text-gray-900">
              {account.createdAt ? new Date(account.createdAt).getFullYear() : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100">
          <div className="flex space-x-4 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className="flex items-center space-x-2 px-4 py-4 border-b-2 border-panda-primary text-panda-primary font-medium"
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-8 text-gray-500">
            <Target className="w-12 h-12 mx-auto text-gray-300 mb-2" />
            <p>Opportunities will be displayed here</p>
          </div>
        </div>
      </div>
    </div>
  );
}
