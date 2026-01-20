import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Image,
  Grid,
  List,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Calendar,
  MapPin,
  Tag,
  Loader2,
  RefreshCw,
  Link2,
  AlertCircle,
  FileText,
  Link as LinkIcon,
  Search,
  Plus,
  Check,
  CheckSquare,
  Square,
  Pencil,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { companyCamApi } from '../services/api';

export default function PhotoGallery({ opportunityId, projectId, title = 'Photos', claimNumber, opportunityName, address }) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tagFilter, setTagFilter] = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [reportClaimNumber, setReportClaimNumber] = useState(claimNumber || '');
  const [newTagInput, setNewTagInput] = useState('');
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [activeActionMenu, setActiveActionMenu] = useState(null); // Track which photo's action menu is open
  const [photoToDelete, setPhotoToDelete] = useState(null); // For delete confirmation
  const [editingPhotoTags, setEditingPhotoTags] = useState(null); // For inline tag editing in list view

  // Bulk selection state
  const [selectedPhotos, setSelectedPhotos] = useState(new Set());
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');

  const queryClient = useQueryClient();

  // Pagination state
  const [page, setPage] = useState(1);
  const [allPhotos, setAllPhotos] = useState([]);
  const PHOTOS_PER_PAGE = 100;

  // Fetch photos for the opportunity with pagination
  const {
    data: photoData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['opportunityPhotos', opportunityId, tagFilter, page],
    queryFn: () =>
      companyCamApi.getOpportunityPhotos(opportunityId, {
        tag: tagFilter || undefined,
        page,
        limit: PHOTOS_PER_PAGE,
      }),
    enabled: !!opportunityId,
  });

  // Extract photos, project, and pagination from response
  const photos = photoData?.photos || [];
  const linkedProject = photoData?.project || null;
  const pagination = photoData?.pagination || { page: 1, limit: PHOTOS_PER_PAGE, total: photos.length, totalPages: 1 };

  // Accumulate photos across pages
  useEffect(() => {
    if (photos.length > 0) {
      if (page === 1) {
        // First page - replace all photos
        setAllPhotos(photos);
      } else {
        // Subsequent pages - append new photos (avoiding duplicates by id)
        setAllPhotos(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPhotos = photos.filter(p => !existingIds.has(p.id));
          return [...prev, ...newPhotos];
        });
      }
    }
  }, [photos, page]);

  // Reset pagination when filter changes
  useEffect(() => {
    setPage(1);
    setAllPhotos([]);
  }, [tagFilter, opportunityId]);

  // Load more handler
  const handleLoadMore = () => {
    if (page < pagination.totalPages && !isFetching) {
      setPage(prev => prev + 1);
    }
  };

  const hasMorePhotos = page < pagination.totalPages;

  // Search CompanyCam projects for linking
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['companyCamProjects', projectSearch],
    queryFn: () => companyCamApi.searchProjects({ search: projectSearch }),
    enabled: showLinkModal && projectSearch.length > 2,
  });

  // Link project mutation
  const linkProjectMutation = useMutation({
    mutationFn: ({ companyCamId }) => companyCamApi.linkProject(companyCamId, opportunityId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
      setShowLinkModal(false);
      setProjectSearch('');
    },
  });

  // Sync project mutation
  const syncProjectMutation = useMutation({
    mutationFn: (companyCamId) => companyCamApi.syncProject(companyCamId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
    },
  });

  // Create new project mutation
  const createProjectMutation = useMutation({
    mutationFn: (projectData) => companyCamApi.createProject(projectData),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
      setShowCreateModal(false);
    },
  });

  // Add tag to photo mutation
  const addTagMutation = useMutation({
    mutationFn: ({ photoId, tag }) => companyCamApi.addPhotoTag(photoId, tag),
    onSuccess: (updatedPhoto) => {
      // Update the selected photo with new tags
      if (selectedPhoto && updatedPhoto) {
        setSelectedPhoto({ ...selectedPhoto, tags: updatedPhoto.tags });
      }
      // Refresh the photo list
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
      setNewTagInput('');
    },
  });

  // Remove tag from photo mutation
  const removeTagMutation = useMutation({
    mutationFn: ({ photoId, tag }) => companyCamApi.removePhotoTag(photoId, tag),
    onSuccess: (updatedPhoto) => {
      // Update the selected photo with new tags
      if (selectedPhoto && updatedPhoto) {
        setSelectedPhoto({ ...selectedPhoto, tags: updatedPhoto.tags });
      }
      // Refresh the photo list
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
    },
  });

  // Handle adding a new tag
  const handleAddTag = (e) => {
    e.preventDefault();
    const tag = newTagInput.trim();
    if (tag && selectedPhoto) {
      // Check if tag already exists on this photo
      if (selectedPhoto.tags && selectedPhoto.tags.includes(tag)) {
        setNewTagInput('');
        return;
      }
      addTagMutation.mutate({ photoId: selectedPhoto.id, tag });
    }
  };

  // Handle removing a tag
  const handleRemoveTag = (tag) => {
    if (selectedPhoto) {
      removeTagMutation.mutate({ photoId: selectedPhoto.id, tag });
    }
  };

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: (photoId) => companyCamApi.deletePhoto(photoId),
    onSuccess: () => {
      // Close delete confirmation
      setPhotoToDelete(null);
      setActiveActionMenu(null);
      // Close lightbox if the deleted photo was selected
      if (selectedPhoto && selectedPhoto.id === photoToDelete?.id) {
        setSelectedPhoto(null);
      }
      // Refresh the photo list
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
    },
  });

  // Handle delete photo
  const handleDeletePhoto = (photo, e) => {
    if (e) e.stopPropagation();
    setPhotoToDelete(photo);
  };

  // Confirm delete
  const confirmDeletePhoto = () => {
    if (photoToDelete) {
      deletePhotoMutation.mutate(photoToDelete.id);
    }
  };

  // Handle edit tags for a photo in list view
  const handleEditTagsInList = (photo, e) => {
    if (e) e.stopPropagation();
    setEditingPhotoTags(photo);
    setNewTagInput('');
    setActiveActionMenu(null);
  };

  // Add tag to photo in list view
  const handleAddTagInList = (e) => {
    e.preventDefault();
    const tag = newTagInput.trim();
    if (tag && editingPhotoTags) {
      if (editingPhotoTags.tags && editingPhotoTags.tags.includes(tag)) {
        setNewTagInput('');
        return;
      }
      addTagMutation.mutate({ photoId: editingPhotoTags.id, tag }, {
        onSuccess: (updatedPhoto) => {
          setEditingPhotoTags({ ...editingPhotoTags, tags: updatedPhoto.tags });
          setNewTagInput('');
        }
      });
    }
  };

  // Remove tag from photo in list view
  const handleRemoveTagInList = (tag) => {
    if (editingPhotoTags) {
      removeTagMutation.mutate({ photoId: editingPhotoTags.id, tag }, {
        onSuccess: (updatedPhoto) => {
          setEditingPhotoTags({ ...editingPhotoTags, tags: updatedPhoto.tags });
        }
      });
    }
  };

  // Bulk selection handlers
  const togglePhotoSelection = (photoId, e) => {
    if (e) e.stopPropagation();
    setSelectedPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  const selectAllPhotos = () => {
    const allPhotoIds = new Set(filteredPhotos.map(photo => photo.id));
    setSelectedPhotos(allPhotoIds);
  };

  const clearSelection = () => {
    setSelectedPhotos(new Set());
  };

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (photoIds) => {
      const results = await Promise.allSettled(
        Array.from(photoIds).map(id => companyCamApi.deletePhoto(id))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        throw new Error(`Failed to delete ${failed} photo(s)`);
      }
      return results;
    },
    onSuccess: () => {
      setShowBulkDeleteConfirm(false);
      clearSelection();
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
    },
  });

  // Bulk tag mutation
  const bulkTagMutation = useMutation({
    mutationFn: async ({ photoIds, tag }) => {
      const results = await Promise.allSettled(
        Array.from(photoIds).map(id => companyCamApi.addTagToPhoto(id, tag))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        throw new Error(`Failed to tag ${failed} photo(s)`);
      }
      return results;
    },
    onSuccess: () => {
      setShowBulkTagModal(false);
      setBulkTagInput('');
      clearSelection();
      queryClient.invalidateQueries(['opportunityPhotos', opportunityId]);
    },
  });

  const handleBulkDelete = () => {
    if (selectedPhotos.size > 0) {
      bulkDeleteMutation.mutate(selectedPhotos);
    }
  };

  const handleBulkTag = (e) => {
    e.preventDefault();
    const tag = bulkTagInput.trim();
    if (tag && selectedPhotos.size > 0) {
      bulkTagMutation.mutate({ photoIds: selectedPhotos, tag });
    }
  };

  // Parse address for create project form
  const parseAddress = () => {
    if (!address) return { street: '', city: '', state: '', postalCode: '' };

    // Handle object format
    if (typeof address === 'object') {
      return {
        street: address.street || address.billingStreet || address.shippingStreet || '',
        city: address.city || address.billingCity || address.shippingCity || '',
        state: address.state || address.billingState || address.shippingState || '',
        postalCode: address.postalCode || address.billingPostalCode || address.shippingPostalCode || '',
      };
    }

    // Handle string format (e.g., "123 Main St, Baltimore, MD 21201")
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      const stateZip = parts[2].split(' ');
      return {
        street: parts[0],
        city: parts[1],
        state: stateZip[0] || '',
        postalCode: stateZip[1] || '',
      };
    }

    return { street: address, city: '', state: '', postalCode: '' };
  };

  // Handle create project submission
  const handleCreateProject = () => {
    const parsedAddress = parseAddress();
    createProjectMutation.mutate({
      name: opportunityName || 'New Project',
      address: parsedAddress,
      opportunityId,
    });
  };

  // Get CompanyCam project URL
  const getCompanyCamUrl = (companyCamId) => {
    return `https://app.companycam.com/projects/${companyCamId}`;
  };

  // Get CompanyCam report template URL with claim number
  const getReportUrl = (companyCamId, claimNum) => {
    // CompanyCam report creation URL - opens the report builder
    // Users can select "Completion Photos" template and add the claim number
    return `https://app.companycam.com/projects/${companyCamId}/reports`;
  };

  // Use accumulated photos for display, get unique tags
  const photoList = allPhotos.length > 0 ? allPhotos : (Array.isArray(photos) ? photos : []);
  const allTags = photoList.length > 0
    ? [...new Set(photoList.flatMap((p) => p.tags || []))]
    : [];
  const totalPhotoCount = pagination.total || photoList.length;

  const openLightbox = (photo, index) => {
    setSelectedPhoto(photo);
    setSelectedIndex(index);
  };

  const closeLightbox = () => {
    setSelectedPhoto(null);
  };

  const goToPrevious = () => {
    if (photos && selectedIndex > 0) {
      const newIndex = selectedIndex - 1;
      setSelectedIndex(newIndex);
      setSelectedPhoto(photos[newIndex]);
    }
  };

  const goToNext = () => {
    if (photos && selectedIndex < photos.length - 1) {
      const newIndex = selectedIndex + 1;
      setSelectedIndex(newIndex);
      setSelectedPhoto(photos[newIndex]);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedPhoto) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhoto, selectedIndex]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-panda-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Failed to load photos</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-panda-primary hover:underline text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  // photoList already defined above with Array.isArray check

  // No linked project - show link UI
  if (!linkedProject) {
    const parsedAddress = parseAddress();

    return (
      <div className="space-y-4">
        <div className="text-center py-12">
          <Camera className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No CompanyCam Project Linked</h3>
          <p className="text-gray-500 mb-6">
            Link to an existing CompanyCam project or create a new one for this job
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Project
            </button>
            <span className="text-gray-400 text-sm">or</span>
            <button
              onClick={() => setShowLinkModal(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              Link Existing Project
            </button>
          </div>
        </div>

        {/* Create Project Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Create CompanyCam Project</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    A new project will be created in CompanyCam using the job details below.
                    Your crew can then upload photos directly to this project.
                  </p>
                </div>

                {/* Project Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                    {opportunityName || 'New Project'}
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property Address</label>
                  <div className="space-y-2">
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                      {parsedAddress.street || 'No street address'}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
                        {parsedAddress.city || 'City'}
                      </div>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
                        {parsedAddress.state || 'State'}
                      </div>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
                        {parsedAddress.postalCode || 'ZIP'}
                      </div>
                    </div>
                  </div>
                </div>

                {createProjectMutation.isError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800">
                      Failed to create project. Please try again.
                    </p>
                  </div>
                )}

                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateProject}
                    disabled={createProjectMutation.isPending || !parsedAddress.street}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createProjectMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Project
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Link Project Modal */}
        {showLinkModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Link CompanyCam Project</h3>
                <button
                  onClick={() => { setShowLinkModal(false); setProjectSearch(''); }}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by address or project name..."
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    autoFocus
                  />
                </div>

                {isSearching && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 text-panda-primary animate-spin" />
                  </div>
                )}

                {searchResults?.projects && searchResults.projects.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {searchResults.projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                        onClick={() => linkProjectMutation.mutate({ companyCamId: project.id })}
                      >
                        <div>
                          <p className="font-medium text-gray-900">{project.name}</p>
                          <p className="text-sm text-gray-500">
                            {project.address?.street_address_1}, {project.address?.city}
                          </p>
                        </div>
                        {linkProjectMutation.isPending ? (
                          <Loader2 className="w-5 h-5 text-panda-primary animate-spin" />
                        ) : (
                          <Plus className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : projectSearch.length > 2 && !isSearching ? (
                  <p className="text-center text-gray-500 py-4">No projects found</p>
                ) : projectSearch.length <= 2 ? (
                  <p className="text-center text-gray-500 py-4">Enter at least 3 characters to search</p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Linked project but no photos
  if (photoList.length === 0) {
    return (
      <div className="space-y-4">
        {/* CompanyCam Actions Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Linked to:</span>
            <span className="font-medium text-gray-900">{linkedProject.name}</span>
          </div>
          <div className="flex items-center space-x-2">
            <a
              href={getCompanyCamUrl(linkedProject.companyCamId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <ExternalLink className="w-4 h-4 mr-1.5" />
              Open in CompanyCam
            </a>
            <button
              onClick={() => syncProjectMutation.mutate(linkedProject.companyCamId)}
              disabled={syncProjectMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {syncProjectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1.5" />
              )}
              Sync Photos
            </button>
          </div>
        </div>
        <div className="text-center py-8">
          <Camera className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No photos synced yet</h3>
          <p className="text-gray-500">Click "Sync Photos" to import photos from CompanyCam</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* CompanyCam Actions Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-100">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium">
            <Check className="w-3 h-3" />
            <span>Linked</span>
          </div>
          <span className="text-sm text-gray-700">{linkedProject.name}</span>
        </div>
        <div className="flex items-center space-x-2">
          <a
            href={getCompanyCamUrl(linkedProject.companyCamId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Open in CompanyCam
          </a>
          <button
            onClick={() => setShowReportModal(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            Create Report
          </button>
          <button
            onClick={() => syncProjectMutation.mutate(linkedProject.companyCamId)}
            disabled={syncProjectMutation.isPending}
            className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Sync photos from CompanyCam"
          >
            {syncProjectMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-sm">
            {photoList.length === totalPhotoCount ? totalPhotoCount : `${photoList.length} of ${totalPhotoCount}`}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Tag Filter */}
          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            >
              <option value="">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          )}

          {/* Refresh */}
          <button
            onClick={() => refetch()}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Refresh photos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* View Mode Toggle */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 ${
                viewMode === 'grid'
                  ? 'bg-panda-primary text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 ${
                viewMode === 'list'
                  ? 'bg-panda-primary text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedPhotos.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-panda-primary/10 border border-panda-primary/20 rounded-lg mb-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-panda-primary">
              {selectedPhotos.size} photo{selectedPhotos.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={selectAllPhotos}
              className="text-sm text-panda-primary hover:text-panda-primary/80 underline"
            >
              Select All ({filteredPhotos.length})
            </button>
            <button
              onClick={clearSelection}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear Selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkTagModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Tag className="w-4 h-4" />
              Tag Selected
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {photoList.map((photo, index) => (
            <div
              key={photo.id}
              onClick={() => openLightbox(photo, index)}
              className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-gray-100"
            >
              <img
                src={photo.thumbnailUrl || photo.photoUrl}
                alt={photo.caption || `Photo ${index + 1}`}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

              {/* Selection Checkbox */}
              <button
                onClick={(e) => togglePhotoSelection(photo.id, e)}
                className={`absolute top-2 left-2 p-1 rounded transition-all ${
                  selectedPhotos.has(photo.id)
                    ? 'bg-panda-primary text-white'
                    : 'bg-white/80 text-gray-600 opacity-0 group-hover:opacity-100'
                }`}
              >
                {selectedPhotos.has(photo.id) ? (
                  <CheckSquare className="w-5 h-5" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>

              {/* Tags badge */}
              {photo.tags && photo.tags.length > 0 && (
                <div className="absolute bottom-2 left-2 right-2">
                  <div className="flex flex-wrap gap-1">
                    {photo.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-black/50 text-white text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                    {photo.tags.length > 2 && (
                      <span className="px-1.5 py-0.5 bg-black/50 text-white text-xs rounded">
                        +{photo.tags.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {photoList.map((photo, index) => (
            <div
              key={photo.id}
              onClick={() => openLightbox(photo, index)}
              className={`flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-100 cursor-pointer group ${
                selectedPhotos.has(photo.id) ? 'bg-panda-primary/10 border border-panda-primary/30' : 'bg-gray-50'
              }`}
            >
              {/* Selection Checkbox */}
              <button
                onClick={(e) => togglePhotoSelection(photo.id, e)}
                className={`p-1 rounded transition-all flex-shrink-0 ${
                  selectedPhotos.has(photo.id)
                    ? 'text-panda-primary'
                    : 'text-gray-400 opacity-0 group-hover:opacity-100'
                }`}
              >
                {selectedPhotos.has(photo.id) ? (
                  <CheckSquare className="w-5 h-5" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200">
                <img
                  src={photo.thumbnailUrl || photo.photoUrl}
                  alt={photo.caption || `Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {photo.caption || `Photo ${index + 1}`}
                </p>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  {photo.takenAt && (
                    <span className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      {new Date(photo.takenAt).toLocaleDateString()}
                    </span>
                  )}
                  {photo.uploadedBy && (
                    <span className="truncate">{photo.uploadedBy}</span>
                  )}
                </div>
                {photo.tags && photo.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {photo.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* Action Buttons */}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleEditTagsInList(photo, e)}
                  className="p-2 text-gray-500 hover:text-panda-primary hover:bg-white rounded-lg transition-colors"
                  title="Edit Tags"
                >
                  <Tag className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDeletePhoto(photo, e)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-lg transition-colors"
                  title="Delete Photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More Button */}
      {hasMorePhotos && (
        <div className="flex justify-center mt-6">
          <button
            onClick={handleLoadMore}
            disabled={isFetching}
            className="flex items-center gap-2 px-6 py-2.5 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Load More Photos ({photoList.length} of {totalPhotoCount})
              </>
            )}
          </button>
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Navigation buttons */}
          {selectedIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white bg-black/30 rounded-full z-10"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {selectedIndex < photoList.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white bg-black/30 rounded-full z-10"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Image - photoUrl is the full-size CloudFront URL after transformation */}
          <div
            className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedPhoto.photoUrl}
              alt={selectedPhoto.caption || 'Photo'}
              className="max-w-full max-h-[calc(100vh-180px)] w-auto h-auto object-contain"
            />

            {/* Photo info */}
            <div className="mt-4 text-white text-center">
              <p className="text-sm text-white/70">
                {selectedIndex + 1} of {photoList.length}
              </p>
              {selectedPhoto.caption && (
                <p className="text-lg mt-2">{selectedPhoto.caption}</p>
              )}
              <div className="flex items-center justify-center space-x-6 mt-2 text-sm text-white/70">
                {selectedPhoto.takenAt && (
                  <span className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {new Date(selectedPhoto.takenAt).toLocaleString()}
                  </span>
                )}
                {selectedPhoto.latitude && selectedPhoto.longitude && (
                  <span className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {selectedPhoto.latitude.toFixed(4)}, {selectedPhoto.longitude.toFixed(4)}
                  </span>
                )}
              </div>
              {/* Tags Section with Edit Capability */}
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                {/* Edit Tags Toggle Button */}
                <button
                  onClick={() => setIsEditingTags(!isEditingTags)}
                  className="text-xs text-white/60 hover:text-white/90 mb-2 flex items-center justify-center mx-auto"
                >
                  <Tag className="w-3 h-3 mr-1" />
                  {isEditingTags ? 'Done Editing Tags' : 'Edit Tags'}
                </button>

                {/* Current Tags Display */}
                {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 mb-2">
                    {selectedPhoto.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`px-2 py-1 bg-white/20 text-white text-sm rounded flex items-center ${
                          isEditingTags ? 'pr-1' : ''
                        }`}
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                        {isEditingTags && (
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            disabled={removeTagMutation.isPending}
                            className="ml-1 p-0.5 hover:bg-white/20 rounded"
                            title="Remove tag"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {/* No tags message when editing */}
                {isEditingTags && (!selectedPhoto.tags || selectedPhoto.tags.length === 0) && (
                  <p className="text-white/50 text-sm mb-2">No tags yet. Add one below.</p>
                )}

                {/* Add Tag Input (shown when editing) */}
                {isEditingTags && (
                  <form onSubmit={handleAddTag} className="flex items-center justify-center gap-2 max-w-xs mx-auto">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="Add a tag..."
                      className="flex-1 px-3 py-1.5 text-sm bg-white/20 border border-white/30 rounded text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      type="submit"
                      disabled={!newTagInput.trim() || addTagMutation.isPending}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm flex items-center"
                    >
                      {addTagMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </form>
                )}

                {/* Suggestion chips from existing tags (shown when editing) */}
                {isEditingTags && allTags.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-white/50 mb-1">Quick add from existing tags:</p>
                    <div className="flex flex-wrap justify-center gap-1">
                      {allTags
                        .filter(t => !selectedPhoto.tags || !selectedPhoto.tags.includes(t))
                        .slice(0, 8)
                        .map((tag) => (
                          <button
                            key={tag}
                            onClick={() => addTagMutation.mutate({ photoId: selectedPhoto.id, tag })}
                            disabled={addTagMutation.isPending}
                            className="px-2 py-0.5 text-xs bg-white/10 hover:bg-white/20 text-white/70 rounded"
                          >
                            + {tag}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center space-x-4 mt-4">
                <a
                  href={selectedPhoto.photoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Original</span>
                </a>
                <a
                  href={selectedPhoto.photoUrl}
                  download
                  className="flex items-center space-x-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Report Modal */}
      {showReportModal && linkedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Create Completion Photos Report</h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  This will open CompanyCam where you can create a "Completion Photos" report.
                  Enter the claim number below to include it in the report.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Claim Number
                </label>
                <input
                  type="text"
                  value={reportClaimNumber}
                  onChange={(e) => setReportClaimNumber(e.target.value)}
                  placeholder="Enter claim number"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Include the claim number in your report title for easy identification
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-700 font-medium mb-1">Report Steps in CompanyCam:</p>
                <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>Click "Reports" → "Create Report from Template"</li>
                  <li>Select "Completion Photos" template</li>
                  <li>Add claim number: <span className="font-medium">{reportClaimNumber || '(enter above)'}</span></li>
                  <li>Generate and download PDF</li>
                </ol>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <a
                  href={getReportUrl(linkedProject.companyCamId, reportClaimNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in CompanyCam
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {photoToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Photo</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this photo? This action cannot be undone.
            </p>
            {photoToDelete.thumbnailUrl && (
              <div className="mb-6 flex justify-center">
                <img
                  src={photoToDelete.thumbnailUrl}
                  alt="Photo to delete"
                  className="w-32 h-32 object-cover rounded-lg"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setPhotoToDelete(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePhoto}
                disabled={deletePhotoMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deletePhotoMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Editing Modal */}
      {editingPhotoTags && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-panda-primary/10 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-panda-primary" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Edit Tags</h3>
              </div>
              <button
                onClick={() => setEditingPhotoTags(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo preview */}
            {editingPhotoTags.thumbnailUrl && (
              <div className="mb-4 flex justify-center">
                <img
                  src={editingPhotoTags.thumbnailUrl}
                  alt="Photo"
                  className="w-24 h-24 object-cover rounded-lg"
                />
              </div>
            )}

            {/* Current tags */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Current Tags</label>
              {editingPhotoTags.tags && editingPhotoTags.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {editingPhotoTags.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTagInList(tag)}
                        disabled={removeTagMutation.isPending}
                        className="p-0.5 text-gray-400 hover:text-red-500 rounded-full"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No tags added yet</p>
              )}
            </div>

            {/* Add new tag */}
            <form onSubmit={handleAddTagInList} className="flex gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="Add a tag..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              />
              <button
                type="submit"
                disabled={!newTagInput.trim() || addTagMutation.isPending}
                className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
              >
                {addTagMutation.isPending ? 'Adding...' : 'Add'}
              </button>
            </form>

            {/* Close button */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => setEditingPhotoTags(null)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete {selectedPhotos.size} Photos</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete {selectedPhotos.size} selected photo{selectedPhotos.size !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Tag Modal */}
      {showBulkTagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-panda-primary/10 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-panda-primary" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Tag {selectedPhotos.size} Photos</h3>
              </div>
              <button
                onClick={() => {
                  setShowBulkTagModal(false);
                  setBulkTagInput('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-4">
              Add a tag to {selectedPhotos.size} selected photo{selectedPhotos.size !== 1 ? 's' : ''}.
            </p>

            <form onSubmit={handleBulkTag}>
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                placeholder="Enter tag name..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkTagModal(false);
                    setBulkTagInput('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!bulkTagInput.trim() || bulkTagMutation.isPending}
                  className="flex-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
                >
                  {bulkTagMutation.isPending ? 'Adding Tag...' : 'Add Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
