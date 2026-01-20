import { useState, useEffect } from 'react';
import {
  X,
  Search,
  MapPin,
  Clock,
  Star,
  CheckCircle,
  AlertCircle,
  Users,
  Truck,
  Calendar,
  ChevronDown,
  ChevronUp,
  Phone,
  Award,
  TrendingUp,
  Navigation,
} from 'lucide-react';
import api from '../services/api';

export default function CrewSelector({
  isOpen,
  onClose,
  onSelectCrew,
  appointmentData, // { opportunityId, workType, address, scheduledDate, estimatedDuration }
}) {
  const [crews, setCrews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCrew, setSelectedCrew] = useState(null);
  const [expandedCrew, setExpandedCrew] = useState(null);
  const [filterSkill, setFilterSkill] = useState('all');
  const [sortBy, setSortBy] = useState('score'); // score, distance, availability

  useEffect(() => {
    if (isOpen && appointmentData) {
      loadCrewCandidates();
    }
  }, [isOpen, appointmentData]);

  const loadCrewCandidates = async () => {
    try {
      setLoading(true);
      // Call the scheduling policy service to get best candidates
      const response = await api.post('/workorders/scheduling/candidates', {
        opportunityId: appointmentData.opportunityId,
        workType: appointmentData.workType,
        address: appointmentData.address,
        scheduledDate: appointmentData.scheduledDate,
        estimatedDuration: appointmentData.estimatedDuration || 120, // default 2 hours
      });

      setCrews(response.data.candidates || []);
    } catch (error) {
      console.error('Failed to load crew candidates:', error);
      // Fallback to all available resources
      try {
        const resourcesResponse = await api.get('/workorders/resources', {
          params: { isActive: true },
        });
        setCrews(resourcesResponse.data.resources?.map(r => ({
          ...r,
          score: 50,
          distance: null,
          travelTime: null,
          todayAppointments: 0,
        })) || []);
      } catch (fallbackError) {
        console.error('Failed to load resources:', fallbackError);
        setCrews([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getAvailabilityStatus = (crew) => {
    if (crew.todayAppointments === 0) return { label: 'Available', color: 'text-green-600' };
    if (crew.todayAppointments < 3) return { label: `${crew.todayAppointments} appointments today`, color: 'text-yellow-600' };
    return { label: 'Busy', color: 'text-red-600' };
  };

  const filteredCrews = crews
    .filter(crew => {
      const matchesSearch = crew.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSkill = filterSkill === 'all' || crew.skills?.includes(filterSkill);
      return matchesSearch && matchesSkill;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
      if (sortBy === 'distance') return (a.distance || 999) - (b.distance || 999);
      if (sortBy === 'availability') return (a.todayAppointments || 0) - (b.todayAppointments || 0);
      return 0;
    });

  const handleConfirmSelection = () => {
    if (selectedCrew) {
      onSelectCrew(selectedCrew);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Select Crew</h2>
            <p className="text-sm text-gray-500">
              {appointmentData?.workType || 'Service'} appointment • {appointmentData?.scheduledDate ? new Date(appointmentData.scheduledDate).toLocaleDateString() : 'No date'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b bg-gray-50 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search crews..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
            />
          </div>

          <select
            value={filterSkill}
            onChange={(e) => setFilterSkill(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
          >
            <option value="all">All Skills</option>
            <option value="roofing">Roofing</option>
            <option value="siding">Siding</option>
            <option value="gutters">Gutters</option>
            <option value="windows">Windows</option>
            <option value="solar">Solar</option>
            <option value="inspection">Inspection</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
          >
            <option value="score">Best Match</option>
            <option value="distance">Closest</option>
            <option value="availability">Most Available</option>
          </select>
        </div>

        {/* Crew List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
            </div>
          ) : filteredCrews.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-gray-900 font-medium">No crews available</h3>
              <p className="text-gray-500 text-sm">Try adjusting your filters or date</p>
            </div>
          ) : (
            filteredCrews.map((crew) => {
              const isSelected = selectedCrew?.id === crew.id;
              const isExpanded = expandedCrew === crew.id;
              const availability = getAvailabilityStatus(crew);

              return (
                <div
                  key={crew.id}
                  className={`border rounded-xl transition-all ${
                    isSelected
                      ? 'border-panda-primary bg-panda-primary/5 ring-2 ring-panda-primary/20'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Main Row */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setSelectedCrew(crew)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Score Badge */}
                      <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center ${getScoreColor(crew.score || 50)}`}>
                        <span className="text-lg font-bold">{crew.score || 50}</span>
                        <span className="text-[10px] uppercase">Match</span>
                      </div>

                      {/* Crew Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 truncate">{crew.name}</h3>
                          {crew.isRecommended && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                              <Star className="w-3 h-3" />
                              Recommended
                            </span>
                          )}
                        </div>

                        {/* Quick Stats */}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                          {crew.distance !== null && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {crew.distance.toFixed(1)} mi away
                            </span>
                          )}
                          {crew.travelTime !== null && (
                            <span className="flex items-center gap-1">
                              <Navigation className="w-4 h-4" />
                              {crew.travelTime} min travel
                            </span>
                          )}
                          <span className={`flex items-center gap-1 ${availability.color}`}>
                            <Calendar className="w-4 h-4" />
                            {availability.label}
                          </span>
                        </div>

                        {/* Skills */}
                        {crew.skills && crew.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {crew.skills.slice(0, 4).map((skill) => (
                              <span
                                key={skill}
                                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                              >
                                {skill}
                              </span>
                            ))}
                            {crew.skills.length > 4 && (
                              <span className="px-2 py-0.5 text-gray-400 text-xs">
                                +{crew.skills.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expand Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCrew(isExpanded ? null : crew.id);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Today's Schedule */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Today's Schedule
                          </h4>
                          {crew.todaySchedule && crew.todaySchedule.length > 0 ? (
                            <div className="space-y-1">
                              {crew.todaySchedule.map((appt, idx) => (
                                <div key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                                  <span className="font-medium">{appt.time}</span>
                                  <span className="text-gray-400">-</span>
                                  <span className="truncate">{appt.location}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">No appointments scheduled</p>
                          )}
                        </div>

                        {/* Performance Stats */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                            <TrendingUp className="w-4 h-4" />
                            Performance
                          </h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Completion Rate</span>
                              <span className="font-medium text-gray-900">{crew.completionRate || 95}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">On-Time Rate</span>
                              <span className="font-medium text-gray-900">{crew.onTimeRate || 92}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Customer Rating</span>
                              <span className="font-medium text-gray-900">{crew.rating || 4.8}/5</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Contact */}
                      {crew.phone && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <a
                            href={`tel:${crew.phone}`}
                            className="inline-flex items-center gap-2 text-sm text-panda-primary hover:underline"
                          >
                            <Phone className="w-4 h-4" />
                            {crew.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {selectedCrew ? (
              <span className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Selected: <strong>{selectedCrew.name}</strong>
              </span>
            ) : (
              <span>Select a crew to continue</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSelection}
              disabled={!selectedCrew}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedCrew
                  ? 'bg-panda-primary text-white hover:bg-panda-primary/90'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Assign Crew
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
