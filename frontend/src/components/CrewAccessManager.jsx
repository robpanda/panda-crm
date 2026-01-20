import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  UserMinus,
  Loader2,
  AlertCircle,
  Check,
  X,
  Mail,
  Phone,
  Camera,
} from 'lucide-react';
import { companyCamApi } from '../services/api';

/**
 * CrewAccessManager - Manages CompanyCam access for crew members
 *
 * Allows granting and revoking CompanyCam project access for third-party contractors.
 * Creates CompanyCam accounts if the crew member doesn't have one.
 */
export default function CrewAccessManager({
  companyCamProjectId,
  opportunityId,
  crewMembers = [], // Array of { id, email, firstName, lastName, phone }
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState(null);
  const [manualEntry, setManualEntry] = useState({ email: '', firstName: '', lastName: '', phone: '' });
  const queryClient = useQueryClient();

  // Fetch current collaborators on the project
  const {
    data: collaborators,
    isLoading: isLoadingCollaborators,
    error: collaboratorsError,
  } = useQuery({
    queryKey: ['companyCamCollaborators', companyCamProjectId],
    queryFn: () => companyCamApi.getProjectCollaborators(companyCamProjectId),
    enabled: !!companyCamProjectId,
  });

  // Grant access mutation
  const grantAccessMutation = useMutation({
    mutationFn: (crewData) => companyCamApi.ensureCrewAccess({
      ...crewData,
      companyCamProjectId,
      opportunityId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['companyCamCollaborators', companyCamProjectId]);
      setShowAddModal(false);
      setSelectedCrew(null);
      setManualEntry({ email: '', firstName: '', lastName: '', phone: '' });
    },
  });

  // Revoke access mutation
  const revokeAccessMutation = useMutation({
    mutationFn: (email) => companyCamApi.revokeCrewAccess({
      email,
      companyCamProjectId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['companyCamCollaborators', companyCamProjectId]);
    },
  });

  // Handle granting access
  const handleGrantAccess = () => {
    const crewData = selectedCrew || manualEntry;
    if (!crewData.email) return;
    grantAccessMutation.mutate(crewData);
  };

  // Check if email already has access
  const hasAccess = (email) => {
    if (!collaborators?.users) return false;
    return collaborators.users.some(
      (u) => u.email?.toLowerCase() === email?.toLowerCase()
    );
  };

  if (!companyCamProjectId) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">
          Link a CompanyCam project first to manage crew access
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Crew Photo Access</h3>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-3 py-1.5 text-sm bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
        >
          <UserPlus className="w-4 h-4 mr-1.5" />
          Grant Access
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          Grant CompanyCam access to crew members so they can view and upload photos for this project.
          If they don't have a CompanyCam account, one will be created automatically.
        </p>
      </div>

      {/* Current collaborators list */}
      {isLoadingCollaborators ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 text-panda-primary animate-spin" />
        </div>
      ) : collaboratorsError ? (
        <div className="text-center py-4 text-red-500">
          <AlertCircle className="w-6 h-6 mx-auto mb-2" />
          <p className="text-sm">Failed to load collaborators</p>
        </div>
      ) : collaborators?.users?.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            {collaborators.users.length} crew member{collaborators.users.length !== 1 ? 's' : ''} with access
          </p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
            {collaborators.users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 bg-white hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">
                      {(user.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => revokeAccessMutation.mutate(user.email)}
                  disabled={revokeAccessMutation.isPending}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Revoke access"
                >
                  {revokeAccessMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserMinus className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 bg-gray-50 rounded-lg">
          <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No crew members have access yet</p>
        </div>
      )}

      {/* Add Crew Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-gray-900">Grant CompanyCam Access</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedCrew(null);
                  setManualEntry({ email: '', firstName: '', lastName: '', phone: '' });
                }}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Select from assigned crew */}
              {crewMembers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select from assigned crew
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {crewMembers.map((crew) => {
                      const alreadyHasAccess = hasAccess(crew.email);
                      return (
                        <div
                          key={crew.id || crew.email}
                          onClick={() => !alreadyHasAccess && setSelectedCrew(crew)}
                          className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedCrew?.email === crew.email
                              ? 'border-panda-primary bg-panda-primary/5'
                              : alreadyHasAccess
                              ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {crew.firstName} {crew.lastName}
                            </p>
                            <p className="text-sm text-gray-500">{crew.email}</p>
                          </div>
                          {alreadyHasAccess ? (
                            <span className="flex items-center text-green-600 text-sm">
                              <Check className="w-4 h-4 mr-1" />
                              Has access
                            </span>
                          ) : selectedCrew?.email === crew.email ? (
                            <div className="w-5 h-5 rounded-full bg-panda-primary flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divider */}
              {crewMembers.length > 0 && (
                <div className="flex items-center space-x-3">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-sm text-gray-400">or</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
              )}

              {/* Manual entry */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter crew member details
                </label>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        value={manualEntry.email}
                        onChange={(e) => {
                          setManualEntry({ ...manualEntry, email: e.target.value });
                          setSelectedCrew(null);
                        }}
                        placeholder="crew@example.com"
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">First Name</label>
                      <input
                        type="text"
                        value={manualEntry.firstName}
                        onChange={(e) => {
                          setManualEntry({ ...manualEntry, firstName: e.target.value });
                          setSelectedCrew(null);
                        }}
                        placeholder="John"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={manualEntry.lastName}
                        onChange={(e) => {
                          setManualEntry({ ...manualEntry, lastName: e.target.value });
                          setSelectedCrew(null);
                        }}
                        placeholder="Doe"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        value={manualEntry.phone}
                        onChange={(e) => {
                          setManualEntry({ ...manualEntry, phone: e.target.value });
                          setSelectedCrew(null);
                        }}
                        placeholder="(555) 123-4567"
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {grantAccessMutation.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">
                    {grantAccessMutation.error?.message || 'Failed to grant access. Please try again.'}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedCrew(null);
                    setManualEntry({ email: '', firstName: '', lastName: '', phone: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGrantAccess}
                  disabled={
                    grantAccessMutation.isPending ||
                    (!selectedCrew?.email && !manualEntry.email)
                  }
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {grantAccessMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Granting Access...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Grant Access
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
