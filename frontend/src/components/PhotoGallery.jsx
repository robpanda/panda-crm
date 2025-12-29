import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { companyCamApi } from '../services/api';

export default function PhotoGallery({ opportunityId, projectId, title = 'Photos' }) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tagFilter, setTagFilter] = useState('');

  // Fetch photos for the opportunity
  const {
    data: photos,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['opportunityPhotos', opportunityId, tagFilter],
    queryFn: () =>
      companyCamApi.getOpportunityPhotos(opportunityId, {
        tag: tagFilter || undefined,
      }),
    enabled: !!opportunityId,
  });

  // Get unique tags from photos
  const allTags = photos
    ? [...new Set(photos.flatMap((p) => p.tags || []))]
    : [];

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

  const photoList = photos || [];

  if (photoList.length === 0) {
    return (
      <div className="text-center py-12">
        <Camera className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No photos yet</h3>
        <p className="text-gray-500 mb-4">
          Photos will appear here when synced from CompanyCam
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-sm">
            {photoList.length}
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
              className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
            >
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
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
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
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white bg-black/30 rounded-full"
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
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white bg-black/30 rounded-full"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Image */}
          <div
            className="max-w-5xl max-h-[80vh] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedPhoto.photoUrl}
              alt={selectedPhoto.caption || 'Photo'}
              className="max-w-full max-h-[70vh] object-contain mx-auto"
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
              {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  {selectedPhoto.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-white/20 text-white text-sm rounded"
                    >
                      <Tag className="w-3 h-3 inline mr-1" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

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
    </div>
  );
}
