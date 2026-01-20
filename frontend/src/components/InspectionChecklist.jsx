import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  CheckCircle,
  Circle,
  ExternalLink,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { companyCamApi } from '../services/api';

// Panda Inspection Photos Checklist - Standard items per CompanyCam template
const INSPECTION_CHECKLIST_ITEMS = [
  { id: 'front_property', label: 'Front of Property', description: 'Full front view of the home' },
  { id: 'left_side', label: 'Left Side', description: 'Left side view of the property' },
  { id: 'right_side', label: 'Right Side', description: 'Right side view of the property' },
  { id: 'back_property', label: 'Back of Property', description: 'Rear view of the home' },
  { id: 'roof_overview', label: 'Roof Overview', description: 'Full roof view from ground or ladder' },
  { id: 'shingle_damage', label: 'Shingle Damage', description: 'Close-up of damaged shingles' },
  { id: 'gutter_damage', label: 'Gutter/Downspout Damage', description: 'Photos of damaged gutters' },
  { id: 'siding_damage', label: 'Siding Damage', description: 'Photos of siding damage if applicable' },
  { id: 'window_damage', label: 'Window/Screen Damage', description: 'Damaged windows or screens' },
  { id: 'hvac_damage', label: 'HVAC/AC Unit', description: 'Exterior AC unit photos' },
  { id: 'fence_damage', label: 'Fence Damage', description: 'Damaged fence sections if applicable' },
  { id: 'additional_damage', label: 'Additional Damage', description: 'Any other damage documentation' },
  { id: 'test_square', label: 'Test Square', description: 'Test square for measurements' },
  { id: 'address_photo', label: 'Address/Mailbox', description: 'Address verification photo' },
];

export default function InspectionChecklist({ opportunityId, projectId }) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch photos for opportunity
  const { data: photoData, isLoading, error, refetch } = useQuery({
    queryKey: ['opportunityPhotos', opportunityId],
    queryFn: () => companyCamApi.getOpportunityPhotos(opportunityId),
    enabled: !!opportunityId,
  });

  // Sync photos mutation
  const syncMutation = useMutation({
    mutationFn: (ccProjectId) => companyCamApi.syncProject(ccProjectId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
    },
  });

  const photos = photoData?.photos || [];
  const project = photoData?.project;

  // Check which items have photos (by matching tags)
  const getItemStatus = (itemId) => {
    const matchingPhotos = photos.filter(
      (p) => p.tags && p.tags.some((tag) => tag.toLowerCase().includes(itemId.replace('_', ' ')))
    );
    return {
      hasPhoto: matchingPhotos.length > 0,
      count: matchingPhotos.length,
      photos: matchingPhotos,
    };
  };

  const completedCount = INSPECTION_CHECKLIST_ITEMS.filter(
    (item) => getItemStatus(item.id).hasPhoto
  ).length;

  const completionPercentage = Math.round((completedCount / INSPECTION_CHECKLIST_ITEMS.length) * 100);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-panda-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-panda-primary/10 rounded-lg">
              <Camera className="w-5 h-5 text-panda-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Inspection Photos Checklist</h3>
              <p className="text-sm text-gray-500">
                {completedCount} of {INSPECTION_CHECKLIST_ITEMS.length} items completed
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Progress indicator */}
            <div className="flex items-center space-x-2">
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    completionPercentage === 100
                      ? 'bg-green-500'
                      : completionPercentage > 50
                      ? 'bg-panda-primary'
                      : 'bg-yellow-500'
                  }`}
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-600">{completionPercentage}%</span>
            </div>

            {/* Actions */}
            {project && (
              <button
                onClick={() => syncMutation.mutate(project.companyCamId)}
                disabled={syncMutation.isPending}
                className="p-2 text-gray-500 hover:text-panda-primary hover:bg-gray-100 rounded-lg"
                title="Sync from CompanyCam"
              >
                <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              </button>
            )}

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Project info */}
        {project && (
          <div className="mt-3 flex items-center space-x-4 text-sm">
            <span className="text-gray-500">
              Linked to: <span className="font-medium text-gray-700">{project.name}</span>
            </span>
            <a
              href={`https://app.companycam.com/projects/${project.companyCamId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-panda-primary hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Open in CompanyCam
            </a>
          </div>
        )}
      </div>

      {/* Checklist items */}
      {isExpanded && (
        <div className="p-4">
          {!project ? (
            <div className="text-center py-6">
              <Camera className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                Link a CompanyCam project in the <span className="font-medium">Photos</span> tab to track inspection photos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {INSPECTION_CHECKLIST_ITEMS.map((item) => {
                const status = getItemStatus(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                      status.hasPhoto
                        ? 'border-green-200 bg-green-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {status.hasPhoto ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`font-medium ${status.hasPhoto ? 'text-green-700' : 'text-gray-900'}`}>
                          {item.label}
                        </p>
                        {status.count > 0 && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                            {status.count} photo{status.count > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{item.description}</p>
                      {status.photos.length > 0 && (
                        <div className="flex mt-2 space-x-1">
                          {status.photos.slice(0, 3).map((photo) => (
                            <img
                              key={photo.id}
                              src={photo.thumbnailUrl || photo.photoUrl}
                              alt={item.label}
                              className="w-10 h-10 rounded object-cover"
                            />
                          ))}
                          {status.photos.length > 3 && (
                            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-xs text-gray-600">
                              +{status.photos.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
