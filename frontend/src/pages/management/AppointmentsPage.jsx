import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { CalendarDays, Plus, Search, Filter, Clock, MapPin, User } from 'lucide-react';
import { scheduleApi } from '../../services/api';

export default function AppointmentsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => scheduleApi.getAppointments({ limit: 50 }),
  });

  return (
    <AdminLayout
      title="Appointments"
      icon={CalendarDays}
      description="Manage and schedule appointments"
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search appointments..."
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
            New Appointment
          </button>
        </div>

        {/* Appointments List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : appointments?.data?.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {appointments.data.map((apt) => (
                <div key={apt.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{apt.subject || apt.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {apt.startDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {new Date(apt.startDate).toLocaleString()}
                          </span>
                        )}
                        {apt.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {apt.location}
                          </span>
                        )}
                        {apt.assignedTo && (
                          <span className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {apt.assignedTo.fullName || apt.assignedTo.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      apt.status === 'completed' ? 'bg-green-100 text-green-700' :
                      apt.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                      apt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {apt.status || 'scheduled'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <CalendarDays className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No appointments found</p>
              <p className="text-sm">Schedule a new appointment to get started</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
