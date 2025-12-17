import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { contactsApi } from '../services/api';
import { Users, Search, Filter, Plus, ChevronRight, Phone, Mail, Building2 } from 'lucide-react';

export default function Contacts() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', { search, page }],
    queryFn: () => contactsApi.getContacts({ search, page, limit: 25 }),
  });

  const contacts = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500">Manage your customer contacts</p>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" />
          <span>New Contact</span>
        </button>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
          />
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="w-12 h-12 mb-2 text-gray-300" />
            <p>No contacts found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {contacts.map((contact) => (
              <Link
                key={contact.id}
                to={`/contacts/${contact.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                    <span className="text-white font-medium">
                      {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {contact.firstName} {contact.lastName}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      {contact.account && (
                        <span className="flex items-center">
                          <Building2 className="w-3 h-3 mr-1" />
                          {contact.account.name}
                        </span>
                      )}
                      {contact.email && (
                        <span className="flex items-center">
                          <Mail className="w-3 h-3 mr-1" />
                          {contact.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {contact.isPastCustomer && (
                    <span className="badge badge-success">Past Customer</span>
                  )}
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
