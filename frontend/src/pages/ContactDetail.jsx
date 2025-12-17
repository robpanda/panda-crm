import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { contactsApi } from '../services/api';
import { Users, ArrowLeft, Phone, Mail, Building2, Edit } from 'lucide-react';

export default function ContactDetail() {
  const { id } = useParams();

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => contactsApi.getContact(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Contact not found</p>
        <Link to="/contacts" className="text-panda-primary hover:underline mt-2 inline-block">
          Back to Contacts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/contacts" className="inline-flex items-center text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Contacts
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <span className="text-white text-xl font-medium">
                {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {contact.firstName} {contact.lastName}
              </h1>
              {contact.title && <p className="text-gray-500">{contact.title}</p>}
              <div className="flex items-center space-x-4 mt-2">
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Phone className="w-4 h-4 mr-1" />
                    {contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Mail className="w-4 h-4 mr-1" />
                    {contact.email}
                  </a>
                )}
              </div>
              {contact.account && (
                <Link to={`/accounts/${contact.account.id}`} className="flex items-center mt-2 text-sm text-gray-500 hover:text-panda-primary">
                  <Building2 className="w-4 h-4 mr-1" />
                  {contact.account.name}
                </Link>
              )}
            </div>
          </div>
          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
            <Edit className="w-5 h-5" />
          </button>
        </div>

        {/* Prospecting Data */}
        {contact.prospectScore && (
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div>
              <p className="text-sm text-gray-500">Prospect Score</p>
              <p className="text-xl font-semibold text-gray-900">{contact.prospectScore}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Lifetime Value</p>
              <p className="text-xl font-semibold text-green-600">
                ${(contact.lifetimeValue || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Jobs</p>
              <p className="text-xl font-semibold text-gray-900">{contact.totalJobCount || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Job</p>
              <p className="text-xl font-semibold text-gray-900">
                {contact.lastJobDate ? new Date(contact.lastJobDate).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
