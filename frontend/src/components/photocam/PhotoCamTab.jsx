import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { photocamApi } from '../../services/api';
import {
  Camera,
  Upload,
  Image,
  Grid,
  List,
  Search,
  Filter,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Download,
  Trash2,
  Edit,
  Tag,
  CheckCircle,
  ClipboardList,
  Loader2,
  FolderOpen,
  AlertCircle,
  RefreshCw,
  ImageOff,
  Layers,
} from 'lucide-react';

// Photo type options
const PHOTO_TYPES = [
  { id: 'BEFORE', label: 'Before', color: 'bg-orange-100 text-orange-700' },
  { id: 'AFTER', label: 'After', color: 'bg-green-100 text-green-700' },
  { id: 'PROGRESS', label: 'Progress', color: 'bg-blue-100 text-blue-700' },
  { id: 'DAMAGE', label: 'Damage', color: 'bg-red-100 text-red-700' },
  { id: 'DETAIL', label: 'Detail', color: 'bg-purple-100 text-purple-700' },
  { id: 'OTHER', label: 'Other', color: 'bg-gray-100 text-gray-700' },
];

export default function PhotoCamTab({ opportunityId, activeSubTab = 'photos' }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  // UI State
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState('PROGRESS');

  // Fetch project for this opportunity (auto-creates if none exists)
  const { data: project, isLoading: projectLoading, error: projectError, refetch: refetchProject } = useQuery({
    queryKey: ['photocam-project', opportunityId],
    queryFn: () => photocamApi.getProjectForOpportunity(opportunityId),
    enabled: !!opportunityId,
    retry: 1,
  });

  // Fetch photos for the project
  const { data: photosData, isLoading: photosLoading, refetch: refetchPhotos } = useQuery({
    queryKey: ['photocam-photos', project?.id, typeFilter],
    queryFn: () => photocamApi.getPhotos(project.id, { type: typeFilter !== 'all' ? typeFilter : undefined }),
    enabled: !!project?.id,
  });

  // Fetch checklists for the project
  const { data: checklists, isLoading: checklistsLoading } = useQuery({
    queryKey: ['photocam-checklists', project?.id],
    queryFn: () => photocamApi.getChecklists(project.id),
    enabled: !!project?.id && activeSubTab === 'checklists',
  });

  // Fetch comparisons for the project
  const { data: comparisons, isLoading: comparisonsLoading } = useQuery({
    queryKey: ['photocam-comparisons', project?.id],
    queryFn: () => photocamApi.getComparisons(project.id),
    enabled: !!project?.id && activeSubTab === 'comparisons',
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ files, type }) => {
      setIsUploading(true);
      setUploadProgress(0);

      if (files.length === 1) {
        return photocamApi.uploadPhoto(project.id, files[0], { type });
      } else {
        return photocamApi.uploadMultiplePhotos(project.id, files, { type });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['photocam-photos', project?.id]);
      setShowUploadModal(false);
      setIsUploading(false);
      setUploadProgress(100);
    },
    onError: (error) => {
      console.error('Upload failed:', error);
      setIsUploading(false);
    },
  });

  // Delete photo mutation
  const deleteMutation = useMutation({
    mutationFn: (photoId) => photocamApi.deletePhoto(photoId),
    onSuccess: () => {
      queryClient.invalidateQueries(['photocam-photos', project?.id]);
      setSelectedPhotos([]);
    },
  });

  const photos = photosData?.data || photosData || [];

  // Filter photos by search term
  const filteredPhotos = photos.filter(photo => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      photo.caption?.toLowerCase().includes(term) ||
      photo.fileName?.toLowerCase().includes(term) ||
      photo.tags?.some(t => t.toLowerCase().includes(term))
    );
  });

  // Handle file selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      uploadMutation.mutate({ files, type: uploadType });
    }
  };

  // Handle drag and drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      uploadMutation.mutate({ files, type: uploadType });
    }
  }, [uploadType, uploadMutation]);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Toggle photo selection
  const togglePhotoSelection = (photoId) => {
    setSelectedPhotos(prev =>
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };

  // Lightbox navigation
  const openLightbox = (photo, index) => {
    setLightboxPhoto(photo);
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setLightboxPhoto(null);
  };

  const navigateLightbox = (direction) => {
    const newIndex = lightboxIndex + direction;
    if (newIndex >= 0 && newIndex < filteredPhotos.length) {
      setLightboxIndex(newIndex);
      setLightboxPhoto(filteredPhotos[newIndex]);
    }
  };

  // Loading state
  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-panda-primary animate-spin" />
        <span className="ml-3 text-gray-600">Loading photo project...</span>
      </div>
    );
  }

  // Error state
  if (projectError) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load photos</h3>
        <p className="text-gray-500 mb-4">There was an error loading the photo project.</p>
        <button
          onClick={() => refetchProject()}
          className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </button>
      </div>
    );
  }

  // Render based on activeSubTab
  return (
    <div className="space-y-4">
      {/* Photos Gallery Sub-tab */}
      {activeSubTab === 'photos' && (
        <>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            {/* Left side - Search and Filter */}
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search photos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary"
              >
                <option value="all">All Types</option>
                {PHOTO_TYPES.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>

            {/* Right side - View toggle and Upload */}
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Upload Button */}
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Photos
              </button>
            </div>
          </div>

          {/* Photo Count & Selection Actions */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''}
              {selectedPhotos.length > 0 && (
                <span className="ml-2 text-panda-primary font-medium">
                  ({selectedPhotos.length} selected)
                </span>
              )}
            </span>
            {selectedPhotos.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedPhotos([])}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Clear Selection
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete ${selectedPhotos.length} photo(s)?`)) {
                      selectedPhotos.forEach(id => deleteMutation.mutate(id));
                    }
                  }}
                  className="text-red-600 hover:text-red-700"
                >
                  Delete Selected
                </button>
              </div>
            )}
          </div>

          {/* Photos Loading */}
          {photosLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-panda-primary animate-spin" />
            </div>
          )}

          {/* Empty State */}
          {!photosLoading && filteredPhotos.length === 0 && (
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center cursor-pointer hover:border-panda-primary/50 transition-colors"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => setShowUploadModal(true)}
            >
              <Camera className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No photos yet</h3>
              <p className="text-gray-500 mb-4">
                Upload photos to document this project. Drag & drop or click to upload.
              </p>
              <button className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg">
                <Upload className="w-4 h-4 mr-2" />
                Upload Photos
              </button>
            </div>
          )}

          {/* Photo Grid */}
          {!photosLoading && filteredPhotos.length > 0 && viewMode === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredPhotos.map((photo, index) => (
                <div
                  key={photo.id}
                  className={`relative group aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer border-2 transition-all ${
                    selectedPhotos.includes(photo.id)
                      ? 'border-panda-primary ring-2 ring-panda-primary/20'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                  onClick={() => openLightbox(photo, index)}
                >
                  {/* Photo Image */}
                  <img
                    src={photo.thumbnailUrl || photo.displayUrl || photo.url}
                    alt={photo.caption || 'Photo'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* Selection checkbox */}
                  <div
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhotoSelection(photo.id);
                    }}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      selectedPhotos.includes(photo.id)
                        ? 'bg-panda-primary border-panda-primary'
                        : 'bg-white/80 border-white/80 group-hover:border-gray-400'
                    }`}>
                      {selectedPhotos.includes(photo.id) && (
                        <CheckCircle className="w-3 h-3 text-white" />
                      )}
                    </div>
                  </div>

                  {/* Type Badge */}
                  {photo.type && (
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        PHOTO_TYPES.find(t => t.id === photo.type)?.color || 'bg-gray-100 text-gray-700'
                      }`}>
                        {photo.type}
                      </span>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn className="w-8 h-8 text-white" />
                  </div>

                  {/* Caption */}
                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-white text-xs truncate">{photo.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Photo List View */}
          {!photosLoading && filteredPhotos.length > 0 && viewMode === 'list' && (
            <div className="divide-y divide-gray-100">
              {filteredPhotos.map((photo, index) => (
                <div
                  key={photo.id}
                  className={`flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg cursor-pointer ${
                    selectedPhotos.includes(photo.id) ? 'bg-panda-primary/5' : ''
                  }`}
                  onClick={() => openLightbox(photo, index)}
                >
                  {/* Checkbox */}
                  <div onClick={(e) => { e.stopPropagation(); togglePhotoSelection(photo.id); }}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedPhotos.includes(photo.id)
                        ? 'bg-panda-primary border-panda-primary'
                        : 'border-gray-300'
                    }`}>
                      {selectedPhotos.includes(photo.id) && (
                        <CheckCircle className="w-3 h-3 text-white" />
                      )}
                    </div>
                  </div>

                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    <img
                      src={photo.thumbnailUrl || photo.displayUrl || photo.url}
                      alt={photo.caption || 'Photo'}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {photo.caption || photo.fileName || 'Untitled Photo'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {photo.createdAt && new Date(photo.createdAt).toLocaleDateString()}
                      {photo.type && ` • ${photo.type}`}
                    </p>
                  </div>

                  {/* Type Badge */}
                  {photo.type && (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      PHOTO_TYPES.find(t => t.id === photo.type)?.color || 'bg-gray-100 text-gray-700'
                    }`}>
                      {photo.type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Checklists Sub-tab */}
      {activeSubTab === 'checklists' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Photo Checklists</h3>
            <button className="inline-flex items-center px-3 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:opacity-90">
              <Plus className="w-4 h-4 mr-1" />
              New Checklist
            </button>
          </div>

          {checklistsLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-panda-primary animate-spin" />
            </div>
          )}

          {!checklistsLoading && (!checklists || checklists.length === 0) && (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
              <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No checklists yet</h3>
              <p className="text-gray-500 mb-4">
                Create photo checklists to ensure all required documentation is captured.
              </p>
              <button className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg">
                <Plus className="w-4 h-4 mr-2" />
                Create Checklist
              </button>
            </div>
          )}

          {!checklistsLoading && checklists && checklists.length > 0 && (
            <div className="space-y-3">
              {checklists.map(checklist => (
                <div key={checklist.id} className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">{checklist.name}</h4>
                      <p className="text-sm text-gray-500">
                        {checklist.completedItems || 0} / {checklist.totalItems || 0} items completed
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        checklist.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        checklist.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {checklist.status || 'Not Started'}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-panda-primary to-panda-secondary transition-all"
                      style={{ width: `${checklist.totalItems ? (checklist.completedItems / checklist.totalItems * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Before/After Comparisons Sub-tab */}
      {activeSubTab === 'comparisons' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Before/After Comparisons</h3>
            <button className="inline-flex items-center px-3 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:opacity-90">
              <Plus className="w-4 h-4 mr-1" />
              New Comparison
            </button>
          </div>

          {comparisonsLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-panda-primary animate-spin" />
            </div>
          )}

          {!comparisonsLoading && (!comparisons || comparisons.length === 0) && (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
              <Layers className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No comparisons yet</h3>
              <p className="text-gray-500 mb-4">
                Create before/after comparisons to showcase project transformations.
              </p>
              <button className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg">
                <Plus className="w-4 h-4 mr-2" />
                Create Comparison
              </button>
            </div>
          )}

          {!comparisonsLoading && comparisons && comparisons.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {comparisons.map(comparison => (
                <div key={comparison.id} className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1 aspect-video bg-gray-100 rounded overflow-hidden">
                      {comparison.beforePhoto ? (
                        <img src={comparison.beforePhoto.thumbnailUrl || comparison.beforePhoto.url} alt="Before" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <ImageOff className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 aspect-video bg-gray-100 rounded overflow-hidden">
                      {comparison.afterPhoto ? (
                        <img src={comparison.afterPhoto.thumbnailUrl || comparison.afterPhoto.url} alt="After" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <ImageOff className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                  </div>
                  <h4 className="font-medium text-gray-900">{comparison.title || 'Comparison'}</h4>
                  {comparison.description && (
                    <p className="text-sm text-gray-500 mt-1">{comparison.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Upload Photos</h3>
              <button onClick={() => setShowUploadModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo Type Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Photo Type</label>
              <div className="flex flex-wrap gap-2">
                {PHOTO_TYPES.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setUploadType(type.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      uploadType === type.id
                        ? 'bg-panda-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop Zone */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-panda-primary transition-colors"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 mx-auto text-panda-primary animate-spin" />
                  <p className="text-gray-600">Uploading...</p>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-panda-primary transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-600 mb-1">Drag & drop photos here</p>
                  <p className="text-sm text-gray-400">or click to browse</p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={closeLightbox}>
          <button
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            onClick={closeLightbox}
          >
            <X className="w-8 h-8" />
          </button>

          {/* Navigation arrows */}
          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 p-2 text-white/80 hover:text-white"
              onClick={(e) => { e.stopPropagation(); navigateLightbox(-1); }}
            >
              <ChevronLeft className="w-10 h-10" />
            </button>
          )}
          {lightboxIndex < filteredPhotos.length - 1 && (
            <button
              className="absolute right-4 p-2 text-white/80 hover:text-white"
              onClick={(e) => { e.stopPropagation(); navigateLightbox(1); }}
            >
              <ChevronRight className="w-10 h-10" />
            </button>
          )}

          {/* Image */}
          <div className="max-w-4xl max-h-[80vh] p-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxPhoto.displayUrl || lightboxPhoto.url}
              alt={lightboxPhoto.caption || 'Photo'}
              className="max-w-full max-h-full object-contain"
            />
            {lightboxPhoto.caption && (
              <p className="text-white text-center mt-4">{lightboxPhoto.caption}</p>
            )}
          </div>

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80">
            {lightboxIndex + 1} / {filteredPhotos.length}
          </div>
        </div>
      )}
    </div>
  );
}
