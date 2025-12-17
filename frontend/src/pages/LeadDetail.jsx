import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi } from '../services/api';
import { UserPlus, ArrowLeft, Phone, Mail, Building2, Edit, ArrowRight } from 'lucide-react';

export default function LeadDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getLead(id),
    enabled: !!id,
  });

  const convertMutation = useMutation({
    mutationFn: () => leadsApi.convertLead(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries(['lead', id]);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <UserPlus className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Lead not found</p>
        <Link to="/leads" className="text-panda-primary hover:underline mt-2 inline-block">
          Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/leads" className="inline-flex items-center text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Leads
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
              lead.status === 'NEW' ? 'bg-blue-100' :
              lead.status === 'CONTACTED' ? 'bg-yellow-100' :
              lead.status === 'QUALIFIED' ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <UserPlus className={`w-8 h-8 ${
                lead.status === 'NEW' ? 'text-blue-600' :
                lead.status === 'CONTACTED' ? 'text-yellow-600' :
                lead.status === 'QUALIFIED' ? 'text-green-600' : 'text-gray-600'
              }`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {lead.firstName} {lead.lastName}
              </h1>
              {lead.company && (
                <p className="text-gray-500 flex items-center">
                  <Building2 className="w-4 h-4 mr-1" />
                  {lead.company}
                </p>
              )}
              <div className="flex items-center space-x-4 mt-2">
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Phone className="w-4 h-4 mr-1" />
                    {lead.phone}
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Mail className="w-4 h-4 mr-1" />
                    {lead.email}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`badge ${
              lead.status === 'NEW' ? 'badge-info' :
              lead.status === 'CONTACTED' ? 'badge-warning' :
              lead.status === 'QUALIFIED' ? 'badge-success' : 'badge-gray'
            }`}>
              {lead.status}
            </span>
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              <Edit className="w-5 h-5" />
            </button>
          </div>
        </div>

        {lead.status !== 'CONVERTED' && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{convertMutation.isPending ? 'Converting...' : 'Convert to Opportunity'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
