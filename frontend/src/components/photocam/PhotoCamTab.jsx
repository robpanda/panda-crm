import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { photocamApi } from '../../services/api';
import {
  Camera,
  Upload,
  Grid,
  List,
  Search,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  CheckCircle,
  ClipboardList,
  Loader2,
  AlertCircle,
  RefreshCw,
  ImageOff,
  Layers,
  Link2,
  FileCheck,
  CheckSquare,
  FileDown,
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

const MAX_BULK_UPLOAD_FILES = 100;
const UPLOAD_IMAGE_MAX_DIMENSION = 2400;
const UPLOAD_IMAGE_QUALITY = 0.82;

export default function PhotoCamTab({ opportunityId, activeSubTab = 'photos' }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const uploadQueueRef = useRef([]);
  const uploadQueueProcessingRef = useRef(false);

  // UI State
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    queued: 0,
    currentFileName: '',
    errors: [],
  });
  const [showUploadTracker, setShowUploadTracker] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraCaptureCount, setCameraCaptureCount] = useState(0);
  const [uploadType, setUploadType] = useState('PROGRESS');
  const [actionMessage, setActionMessage] = useState(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState('zip');
  const [pendingExportJobId, setPendingExportJobId] = useState(null);
  const [pendingExportAttempts, setPendingExportAttempts] = useState(0);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [galleryMode, setGalleryMode] = useState('existing');
  const [selectedGalleryId, setSelectedGalleryId] = useState('');
  const [newGalleryName, setNewGalleryName] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedChecklistId, setSelectedChecklistId] = useState('');
  const [selectedChecklistItemId, setSelectedChecklistItemId] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportMode, setReportMode] = useState('existing');
  const [selectedReportId, setSelectedReportId] = useState('');
  const [newReportName, setNewReportName] = useState('');
  const [generateOnCreate, setGenerateOnCreate] = useState(true);
  const [showCreateChecklistModal, setShowCreateChecklistModal] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState('');
  const [newChecklistDescription, setNewChecklistDescription] = useState('');
  const [newChecklistTemplateId, setNewChecklistTemplateId] = useState('');

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

  const { data: galleriesData } = useQuery({
    queryKey: ['photocam-galleries', project?.id],
    queryFn: () => photocamApi.getGalleries(project.id),
    enabled: !!project?.id && activeSubTab === 'photos',
    retry: 1,
  });

  const { data: checklistOptionsData } = useQuery({
    queryKey: ['photocam-checklists-options', project?.id],
    queryFn: () => photocamApi.getChecklists(project.id),
    enabled: !!project?.id && activeSubTab === 'photos',
    retry: 1,
  });

  const { data: checklistTemplateOptionsData } = useQuery({
    queryKey: ['photocam-checklist-templates'],
    queryFn: () => photocamApi.getTemplates({ templateType: 'CHECKLIST' }),
    enabled: !!project?.id && activeSubTab === 'checklists',
    retry: 1,
  });

  const { data: reportsData } = useQuery({
    queryKey: ['photocam-reports', project?.id],
    queryFn: async () => {
      try {
        const response = await photocamApi.getReports({ projectId: project.id, limit: 100 });
        return response?.data || [];
      } catch (error) {
        // Reports are flag-gated on the backend; keep UI non-blocking if disabled.
        if (error?.response?.status === 503) {
          return [];
        }
        throw error;
      }
    },
    enabled: !!project?.id && activeSubTab === 'photos',
    retry: 1,
  });

  const normalizeUploadFileName = (fileName = 'photo.jpg') => {
    const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'photo';
    return `${base}.jpg`;
  };

  const compressImageToJpeg = useCallback(async (file) => {
    const loadImage = (blob) => new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = (error) => {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      };
      image.src = objectUrl;
    });

    try {
      const image = await loadImage(file);
      const ratio = Math.min(
        1,
        UPLOAD_IMAGE_MAX_DIMENSION / Math.max(image.width || 1, image.height || 1)
      );
      const width = Math.max(1, Math.round((image.width || 1) * ratio));
      const height = Math.max(1, Math.round((image.height || 1) * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to initialize compression canvas');
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) {
            reject(new Error('Compression output was empty'));
            return;
          }
          resolve(result);
        }, 'image/jpeg', UPLOAD_IMAGE_QUALITY);
      });

      return new File([blob], normalizeUploadFileName(file.name), { type: 'image/jpeg' });
    } catch (error) {
      // Fall back to original file if compression fails.
      return file;
    }
  }, []);

  const processUploadQueue = useCallback(async () => {
    if (uploadQueueProcessingRef.current) return;
    if (!project?.id) return;
    if (!uploadQueueRef.current.length) return;

    uploadQueueProcessingRef.current = true;
    setIsUploading(true);
    setShowUploadTracker(true);

    try {
      while (uploadQueueRef.current.length > 0) {
        const nextItem = uploadQueueRef.current.shift();
        setUploadStats((prev) => ({
          ...prev,
          queued: uploadQueueRef.current.length,
          currentFileName: nextItem.file.name,
        }));

        try {
          // Compress on-device to keep payloads small for large background batches.
          const compressedFile = await compressImageToJpeg(nextItem.file);
          await photocamApi.uploadPhoto(project.id, compressedFile, { type: nextItem.type });
          setUploadStats((prev) => {
            const next = {
              ...prev,
              completed: prev.completed + 1,
              queued: uploadQueueRef.current.length,
            };
            const pct = next.total > 0
              ? Math.round(((next.completed + next.failed) / next.total) * 100)
              : 100;
            setUploadProgress(pct);
            return next;
          });
        } catch (error) {
          const errMsg = error?.response?.data?.error?.message || error?.message || 'Upload failed';
          setUploadStats((prev) => {
            const next = {
              ...prev,
              failed: prev.failed + 1,
              queued: uploadQueueRef.current.length,
              errors: [...prev.errors, `${nextItem.file.name}: ${errMsg}`].slice(-5),
            };
            const pct = next.total > 0
              ? Math.round(((next.completed + next.failed) / next.total) * 100)
              : 100;
            setUploadProgress(pct);
            return next;
          });
        }
      }
    } finally {
      uploadQueueProcessingRef.current = false;
      setIsUploading(false);
      setUploadStats((prev) => {
        const processed = prev.completed + prev.failed;
        const pct = prev.total > 0 ? Math.round((processed / prev.total) * 100) : 100;
        setUploadProgress(pct);
        return { ...prev, currentFileName: '', queued: 0 };
      });
      await queryClient.invalidateQueries(['photocam-photos', project?.id]);
      await queryClient.invalidateQueries(['photocam-galleries', project?.id]);
    }
  }, [compressImageToJpeg, project?.id, queryClient]);

  const enqueueUploadFiles = useCallback((incomingFiles, type, source = 'upload') => {
    if (!project?.id) {
      setActionMessage({ type: 'error', text: 'Photo project is not ready yet. Please retry.' });
      return;
    }

    const files = Array.from(incomingFiles || []).filter((file) => file.type?.startsWith('image/'));
    if (!files.length) return;

    const accepted = files.slice(0, MAX_BULK_UPLOAD_FILES);
    if (files.length > MAX_BULK_UPLOAD_FILES) {
      setActionMessage({
        type: 'error',
        text: `Only the first ${MAX_BULK_UPLOAD_FILES} files were queued.`,
      });
    }

    const items = accepted.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      type,
      source,
      order: uploadQueueRef.current.length + index,
    }));

    uploadQueueRef.current.push(...items);
    setUploadStats((prev) => {
      const shouldReset = !uploadQueueProcessingRef.current && prev.queued === 0;
      return {
        total: shouldReset ? items.length : prev.total + items.length,
        completed: shouldReset ? 0 : prev.completed,
        failed: shouldReset ? 0 : prev.failed,
        queued: uploadQueueRef.current.length,
        currentFileName: shouldReset ? '' : prev.currentFileName,
        errors: shouldReset ? [] : prev.errors,
      };
    });
    setShowUploadTracker(true);
    if (!uploadQueueProcessingRef.current) setUploadProgress(0);
    setActionMessage({
      type: 'success',
      text: `${items.length} photo${items.length > 1 ? 's' : ''} queued for background upload.`,
    });

    // Process in selected order (sequential), preserving capture/order intent.
    processUploadQueue();
  }, [processUploadQueue, project?.id]);

  // Delete photo mutation
  const deleteMutation = useMutation({
    mutationFn: (photoId) => photocamApi.deletePhoto(photoId),
    onSuccess: () => {
      queryClient.invalidateQueries(['photocam-photos', project?.id]);
      setSelectedPhotos([]);
      setSelectionMode(false);
    },
  });

  const bulkDownloadMutation = useMutation({
    mutationFn: (outputFormat) => photocamApi.bulkDownloadPhotos({
      photoIds: selectedPhotos,
      outputFormat,
      projectId: project?.id,
      opportunityId,
    }),
    onSuccess: (result) => {
      setShowDownloadModal(false);

      if (result?.downloadUrl) {
        window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
        setPendingExportJobId(null);
        setPendingExportAttempts(0);
      } else if (result?.queued && result?.exportJobId) {
        setPendingExportJobId(result.exportJobId);
        setPendingExportAttempts(0);
      }

      setActionMessage({
        type: 'success',
        text: result?.queued
          ? `Export queued (${result.totalPhotos} photos). We will auto-open when ready.`
          : `Export ready (${result.totalPhotos} photos).`,
      });
    },
    onError: (error) => {
      setActionMessage({
        type: 'error',
        text: error?.response?.data?.error?.message || 'Bulk download failed',
      });
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: (payload) => photocamApi.bulkAssignPhotos(payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['photocam-photos', project?.id]);
      queryClient.invalidateQueries(['photocam-galleries', project?.id]);
      queryClient.invalidateQueries(['photocam-reports', project?.id]);
      setActionMessage({ type: 'success', text: 'Photos updated successfully.' });
      setShowGalleryModal(false);
      setShowAssignModal(false);
      setShowReportModal(false);
    },
    onError: (error) => {
      setActionMessage({
        type: 'error',
        text: error?.response?.data?.error?.message || 'Bulk action failed',
      });
    },
  });

  const createGalleryMutation = useMutation({
    mutationFn: (payload) => photocamApi.createGalleryFromSelection(payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['photocam-galleries', project?.id]);
      setActionMessage({ type: 'success', text: 'Gallery created from selected photos.' });
      setShowGalleryModal(false);
      setSelectedPhotos([]);
      setSelectionMode(false);
    },
    onError: (error) => {
      setActionMessage({
        type: 'error',
        text: error?.response?.data?.error?.message || 'Unable to create gallery',
      });
    },
  });

  const createReportMutation = useMutation({
    mutationFn: async ({ name, reportId, createMode }) => {
      if (createMode === 'existing') {
        return photocamApi.bulkAssignPhotos({
          photoIds: selectedPhotos,
          targetType: 'REPORT',
          targetId: reportId,
        });
      }

      const createdReport = await photocamApi.createReport({
        name,
        projectId: project?.id,
        opportunityId,
        items: selectedPhotos.map((photoId, index) => ({ photoId, sortOrder: index })),
      });

      if (generateOnCreate) {
        await photocamApi.generateReport(createdReport.id);
      }

      return createdReport;
    },
    onSuccess: async (result, variables) => {
      queryClient.invalidateQueries(['photocam-reports', project?.id]);
      setShowReportModal(false);
      setSelectedPhotos([]);
      setSelectionMode(false);

      if (variables.createMode === 'new' && generateOnCreate && result?.id) {
        try {
          const download = await photocamApi.getReportDownload(result.id);
          if (download?.url) {
            window.open(download.url, '_blank', 'noopener,noreferrer');
          }
        } catch (error) {
          // Non-blocking: report may still be generating
        }
      }

      setActionMessage({ type: 'success', text: 'Report action completed.' });
    },
    onError: (error) => {
      setActionMessage({
        type: 'error',
        text: error?.response?.data?.error?.message || 'Unable to process report action',
      });
    },
  });

  const createChecklistMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = newChecklistName.trim();
      if (!trimmedName) {
        throw new Error('Checklist name is required.');
      }

      if (newChecklistTemplateId) {
        return photocamApi.createChecklistFromTemplate(project.id, newChecklistTemplateId, {
          name: trimmedName,
          description: newChecklistDescription.trim() || undefined,
        });
      }

      return photocamApi.createChecklist(project.id, {
        name: trimmedName,
        description: newChecklistDescription.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['photocam-checklists', project?.id]);
      queryClient.invalidateQueries(['photocam-checklists-options', project?.id]);
      setActionMessage({ type: 'success', text: 'Checklist created successfully.' });
      setShowCreateChecklistModal(false);
      setNewChecklistName('');
      setNewChecklistDescription('');
      setNewChecklistTemplateId('');
    },
    onError: (error) => {
      setActionMessage({
        type: 'error',
        text: error?.response?.data?.error?.message || error?.message || 'Failed to create checklist',
      });
    },
  });

  const photos = photosData?.photos || photosData?.data?.photos || [];

  const galleryItems = Array.isArray(galleriesData?.data)
    ? galleriesData.data
    : Array.isArray(galleriesData)
      ? galleriesData
      : [];

  const checklistOptions = Array.isArray(checklistOptionsData?.data)
    ? checklistOptionsData.data
    : Array.isArray(checklistOptionsData)
      ? checklistOptionsData
      : [];

  const checklistTemplateOptions = Array.isArray(checklistTemplateOptionsData)
    ? checklistTemplateOptionsData
    : Array.isArray(checklistTemplateOptionsData?.data)
      ? checklistTemplateOptionsData.data
      : [];

  const reportItems = Array.isArray(reportsData)
    ? reportsData
    : Array.isArray(reportsData?.data)
      ? reportsData.data
      : [];

  const selectedChecklist = useMemo(
    () => checklistOptions.find((item) => item.id === selectedChecklistId) || null,
    [checklistOptions, selectedChecklistId]
  );

  const checklistItemOptions = useMemo(() => {
    const sections = selectedChecklist?.sections || [];
    const items = [];
    sections.forEach((section) => {
      (section.items || []).forEach((item) => {
        items.push({
          id: item.id,
          label: `${section.name}: ${item.name}`,
        });
      });
    });
    return items;
  }, [selectedChecklist]);

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

  useEffect(() => {
    if (selectedPhotos.length === 0) {
      setSelectionMode(false);
    }
  }, [selectedPhotos.length]);

  useEffect(() => {
    setSelectedPhotos([]);
    setSelectionMode(false);
    setActionMessage(null);
    setPendingExportJobId(null);
    setPendingExportAttempts(0);
  }, [activeSubTab, project?.id]);

  useEffect(() => () => clearLongPressTimer(), []);

  useEffect(() => {
    if (!pendingExportJobId) return undefined;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const status = await photocamApi.getBulkDownloadStatus(pendingExportJobId);
        if (cancelled) return;

        if (status?.status === 'READY' && status?.downloadUrl) {
          window.open(status.downloadUrl, '_blank', 'noopener,noreferrer');
          setActionMessage({ type: 'success', text: 'Bulk export is ready and downloaded.' });
          setPendingExportJobId(null);
          setPendingExportAttempts(0);
          return;
        }

        if (status?.status === 'FAILED') {
          setActionMessage({
            type: 'error',
            text: status?.error || 'Bulk export failed before completion.',
          });
          setPendingExportJobId(null);
          setPendingExportAttempts(0);
          return;
        }

        if (pendingExportAttempts >= 30) {
          setActionMessage({
            type: 'error',
            text: 'Bulk export is still processing. Please retry in a moment.',
          });
          setPendingExportJobId(null);
          setPendingExportAttempts(0);
          return;
        }

        setPendingExportAttempts((prev) => prev + 1);
      } catch (error) {
        if (cancelled) return;
        setActionMessage({
          type: 'error',
          text: error?.response?.data?.error?.message || 'Unable to fetch bulk export status.',
        });
        setPendingExportJobId(null);
        setPendingExportAttempts(0);
      }
    }, 3500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingExportJobId, pendingExportAttempts]);

  // Handle file selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) enqueueUploadFiles(files, uploadType, 'upload');
    e.target.value = '';
  };

  const handleCameraCapture = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      enqueueUploadFiles(files, uploadType, 'camera');
      setCameraCaptureCount((prev) => prev + files.length);
    }
    e.target.value = '';
  };

  // Handle drag and drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) enqueueUploadFiles(files, uploadType, 'drag-drop');
  }, [enqueueUploadFiles, uploadType]);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const openCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  // Toggle photo selection
  const togglePhotoSelection = (photoId) => {
    setSelectedPhotos(prev =>
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePhotoTouchStart = (photoId) => {
    if (selectionMode) return;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      setSelectionMode(true);
      setSelectedPhotos((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]));
    }, 450);
  };

  const handlePhotoTouchEnd = () => {
    clearLongPressTimer();
  };

  const handlePhotoActivate = (photo, index) => {
    if (selectionMode) {
      togglePhotoSelection(photo.id);
      return;
    }
    openLightbox(photo, index);
  };

  const selectAllVisible = () => {
    setSelectionMode(true);
    setSelectedPhotos(filteredPhotos.map((photo) => photo.id));
  };

  const clearSelection = () => {
    setSelectedPhotos([]);
    setSelectionMode(false);
  };

  const submitBulkDownload = () => {
    if (!selectedPhotos.length) return;
    bulkDownloadMutation.mutate(downloadFormat);
  };

  const submitBulkGallery = () => {
    if (!selectedPhotos.length || !project?.id) return;

    if (galleryMode === 'existing') {
      if (!selectedGalleryId) {
        setActionMessage({ type: 'error', text: 'Select a gallery first.' });
        return;
      }
      bulkAssignMutation.mutate({
        photoIds: selectedPhotos,
        targetType: 'GALLERY',
        targetId: selectedGalleryId,
      });
      return;
    }

    if (!newGalleryName.trim()) {
      setActionMessage({ type: 'error', text: 'Gallery name is required.' });
      return;
    }

    createGalleryMutation.mutate({
      projectId: project.id,
      name: newGalleryName.trim(),
      description: `Created from ${selectedPhotos.length} selected photos`,
      photoIds: selectedPhotos,
    });
  };

  const submitBulkAssignChecklist = () => {
    if (!selectedPhotos.length) return;
    if (!selectedChecklistItemId) {
      setActionMessage({ type: 'error', text: 'Select a checklist item first.' });
      return;
    }
    bulkAssignMutation.mutate({
      photoIds: selectedPhotos,
      targetType: 'CHECKLIST_ITEM',
      targetId: selectedChecklistItemId,
    });
  };

  const submitBulkReport = () => {
    if (!selectedPhotos.length) return;

    if (reportMode === 'existing') {
      if (!selectedReportId) {
        setActionMessage({ type: 'error', text: 'Select a report first.' });
        return;
      }
      createReportMutation.mutate({
        createMode: 'existing',
        reportId: selectedReportId,
      });
      return;
    }

    if (!newReportName.trim()) {
      setActionMessage({ type: 'error', text: 'Report name is required.' });
      return;
    }

    createReportMutation.mutate({
      createMode: 'new',
      name: newReportName.trim(),
    });
  };

  const openCreateChecklistModal = () => {
    setShowCreateChecklistModal(true);
    setNewChecklistName('');
    setNewChecklistDescription('');
    setNewChecklistTemplateId('');
  };

  const submitCreateChecklist = () => {
    createChecklistMutation.mutate();
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

              {/* Camera Button */}
              <button
                onClick={() => {
                  setCameraCaptureCount(0);
                  setShowCameraModal(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Camera className="w-4 h-4 mr-2" />
                Camera
              </button>

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

          {/* Photo Count + selection state */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''}
                {selectedPhotos.length > 0 && (
                  <span className="ml-2 text-panda-primary font-medium">
                    ({selectedPhotos.length} selected)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {!selectionMode && (
                  <button
                    onClick={() => setSelectionMode(true)}
                    className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    <CheckSquare className="w-4 h-4 mr-1.5" />
                    Select
                  </button>
                )}
                {selectionMode && (
                  <>
                    <button
                      onClick={selectAllVisible}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Select All
                    </button>
                    <button
                      onClick={clearSelection}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            </div>

            {actionMessage && (
              <div className={`rounded-lg border px-3 py-2 text-sm ${
                actionMessage.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}>
                {actionMessage.text}
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
            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 ${selectionMode ? 'pb-40 md:pb-28' : ''}`}>
              {filteredPhotos.map((photo, index) => (
                <div
                  key={photo.id}
                  className={`relative group aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer border-2 transition-all ${
                    selectedPhotos.includes(photo.id)
                      ? 'border-panda-primary ring-2 ring-panda-primary/20'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                  onClick={() => handlePhotoActivate(photo, index)}
                  onTouchStart={() => handlePhotoTouchStart(photo.id)}
                  onTouchEnd={handlePhotoTouchEnd}
                  onTouchCancel={handlePhotoTouchEnd}
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
            <div className={`divide-y divide-gray-100 ${selectionMode ? 'pb-40 md:pb-28' : ''}`}>
              {filteredPhotos.map((photo, index) => (
                <div
                  key={photo.id}
                  className={`flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg cursor-pointer ${
                    selectedPhotos.includes(photo.id) ? 'bg-panda-primary/5' : ''
                  }`}
                  onClick={() => handlePhotoActivate(photo, index)}
                  onTouchStart={() => handlePhotoTouchStart(photo.id)}
                  onTouchEnd={handlePhotoTouchEnd}
                  onTouchCancel={handlePhotoTouchEnd}
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
            <button
              onClick={openCreateChecklistModal}
              className="inline-flex items-center px-3 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:opacity-90"
            >
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
              <button
                onClick={openCreateChecklistModal}
                className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg"
              >
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

      {/* Sticky bulk action bar (mobile/tablet-first) */}
      {activeSubTab === 'photos' && selectionMode && selectedPhotos.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:inset-x-6 md:bottom-4 md:rounded-xl md:border md:shadow-xl">
          <div className="mx-auto max-w-7xl px-3 py-3">
            <div className="flex items-center justify-between gap-2 text-sm mb-2">
              <span className="font-medium text-gray-900">{selectedPhotos.length} selected</span>
              <button onClick={clearSelection} className="text-gray-500 hover:text-gray-700">Clear</button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setShowDownloadModal(true)}
                className="inline-flex items-center whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FileDown className="w-4 h-4 mr-1.5" />
                Bulk Download
              </button>
              <button
                onClick={() => setShowGalleryModal(true)}
                className="inline-flex items-center whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Link2 className="w-4 h-4 mr-1.5" />
                Add To Gallery
              </button>
              <button
                onClick={() => setShowAssignModal(true)}
                className="inline-flex items-center whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ClipboardList className="w-4 h-4 mr-1.5" />
                Assign Checklist
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                className="inline-flex items-center whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FileCheck className="w-4 h-4 mr-1.5" />
                Add To Report
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete ${selectedPhotos.length} selected photo(s)?`)) {
                    selectedPhotos.forEach((id) => deleteMutation.mutate(id));
                  }
                }}
                className="inline-flex items-center whitespace-nowrap rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-1.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-md sm:rounded-2xl sm:mx-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Bulk Download</h3>
              <button onClick={() => setShowDownloadModal(false)} className="p-1 text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
            <select
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            >
              <option value="zip">ZIP (all originals)</option>
              <option value="pdf">PDF (photo report)</option>
            </select>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowDownloadModal(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2">Cancel</button>
              <button
                onClick={submitBulkDownload}
                disabled={bulkDownloadMutation.isLoading}
                className="flex-1 rounded-lg bg-panda-primary px-4 py-2 text-white disabled:opacity-60"
              >
                {bulkDownloadMutation.isLoading ? 'Preparing...' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Gallery Modal */}
      {showGalleryModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl sm:mx-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Selected Photos To Gallery</h3>
              <button onClick={() => setShowGalleryModal(false)} className="p-1 text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setGalleryMode('existing')}
                  className={`flex-1 rounded-lg border px-3 py-2 ${galleryMode === 'existing' ? 'border-panda-primary bg-panda-primary/5 text-panda-primary' : 'border-gray-200'}`}
                >
                  Existing Gallery
                </button>
                <button
                  onClick={() => setGalleryMode('new')}
                  className={`flex-1 rounded-lg border px-3 py-2 ${galleryMode === 'new' ? 'border-panda-primary bg-panda-primary/5 text-panda-primary' : 'border-gray-200'}`}
                >
                  Create New
                </button>
              </div>

              {galleryMode === 'existing' ? (
                <select
                  value={selectedGalleryId}
                  onChange={(e) => setSelectedGalleryId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  <option value="">Select gallery...</option>
                  {galleryItems.map((gallery) => (
                    <option key={gallery.id} value={gallery.id}>{gallery.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={newGalleryName}
                  onChange={(e) => setNewGalleryName(e.target.value)}
                  placeholder="New gallery name"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              )}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowGalleryModal(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2">Cancel</button>
              <button
                onClick={submitBulkGallery}
                disabled={bulkAssignMutation.isLoading || createGalleryMutation.isLoading}
                className="flex-1 rounded-lg bg-panda-primary px-4 py-2 text-white disabled:opacity-60"
              >
                {bulkAssignMutation.isLoading || createGalleryMutation.isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Checklist Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl sm:mx-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Assign To Checklist Item</h3>
              <button onClick={() => setShowAssignModal(false)} className="p-1 text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <select
                value={selectedChecklistId}
                onChange={(e) => {
                  setSelectedChecklistId(e.target.value);
                  setSelectedChecklistItemId('');
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              >
                <option value="">Select checklist...</option>
                {checklistOptions.map((checklist) => (
                  <option key={checklist.id} value={checklist.id}>{checklist.name}</option>
                ))}
              </select>
              <select
                value={selectedChecklistItemId}
                onChange={(e) => setSelectedChecklistItemId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                disabled={!selectedChecklistId}
              >
                <option value="">Select checklist item...</option>
                {checklistItemOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowAssignModal(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2">Cancel</button>
              <button
                onClick={submitBulkAssignChecklist}
                disabled={bulkAssignMutation.isLoading}
                className="flex-1 rounded-lg bg-panda-primary px-4 py-2 text-white disabled:opacity-60"
              >
                {bulkAssignMutation.isLoading ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl sm:mx-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Selected Photos To Report</h3>
              <button onClick={() => setShowReportModal(false)} className="p-1 text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setReportMode('existing')}
                  className={`flex-1 rounded-lg border px-3 py-2 ${reportMode === 'existing' ? 'border-panda-primary bg-panda-primary/5 text-panda-primary' : 'border-gray-200'}`}
                >
                  Existing Report
                </button>
                <button
                  onClick={() => setReportMode('new')}
                  className={`flex-1 rounded-lg border px-3 py-2 ${reportMode === 'new' ? 'border-panda-primary bg-panda-primary/5 text-panda-primary' : 'border-gray-200'}`}
                >
                  Create New
                </button>
              </div>

              {reportMode === 'existing' ? (
                <select
                  value={selectedReportId}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  <option value="">Select report...</option>
                  {reportItems.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.name} ({report.status || 'PENDING'})
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    value={newReportName}
                    onChange={(e) => setNewReportName(e.target.value)}
                    placeholder="New report name"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={generateOnCreate}
                      onChange={(e) => setGenerateOnCreate(e.target.checked)}
                    />
                    Generate PDF immediately
                  </label>
                </>
              )}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowReportModal(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2">Cancel</button>
              <button
                onClick={submitBulkReport}
                disabled={createReportMutation.isLoading}
                className="flex-1 rounded-lg bg-panda-primary px-4 py-2 text-white disabled:opacity-60"
              >
                {createReportMutation.isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
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
                  <p className="text-gray-600">Uploading in background...</p>
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
                  <p className="text-gray-600 mb-1">Drag & drop up to 100 photos</p>
                  <p className="text-sm text-gray-400">Images are compressed to JPEG and uploaded in selected order.</p>
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

            <p className="mt-3 text-xs text-gray-500">
              You can close this modal after choosing files. Upload continues in the background.
            </p>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:mx-auto sm:max-w-lg sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Capture Photos</h3>
              <button
                onClick={() => setShowCameraModal(false)}
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Photo Type</label>
              <div className="flex flex-wrap gap-2">
                {PHOTO_TYPES.map((type) => (
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

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <p>Tap <strong>Take Photo</strong>, capture, then tap again for the next shot.</p>
              <p className="mt-1">Each image is compressed to JPEG and uploaded in background order.</p>
              {cameraCaptureCount > 0 && (
                <p className="mt-2 text-emerald-700 font-medium">{cameraCaptureCount} photo(s) captured this session.</p>
              )}
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraCapture}
              className="hidden"
            />

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowCameraModal(false)}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2"
              >
                Done
              </button>
              <button
                onClick={openCameraCapture}
                className="flex-1 rounded-lg bg-panda-primary px-4 py-2 text-white"
              >
                Take Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background upload tracker */}
      {showUploadTracker && uploadStats.total > 0 && (
        <div className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-40 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:left-auto sm:right-4 sm:w-[340px]">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">
              Uploading {uploadStats.completed + uploadStats.failed} / {uploadStats.total}
            </span>
            <button
              onClick={() => setShowUploadTracker(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              Hide
            </button>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-panda-primary transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <div className="mt-2 text-xs text-gray-600">
            {isUploading
              ? `Now uploading: ${uploadStats.currentFileName || 'processing...'}` : 'Upload queue completed.'}
          </div>
          {!isUploading && uploadStats.failed === 0 && (
            <div className="mt-1 text-xs font-medium text-emerald-700">All files uploaded successfully.</div>
          )}
          {uploadStats.failed > 0 && (
            <div className="mt-1 text-xs font-medium text-red-700">
              {uploadStats.failed} file(s) failed. Last errors: {uploadStats.errors.join(' | ')}
            </div>
          )}
        </div>
      )}

      {/* Create Checklist Modal */}
      {showCreateChecklistModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:mx-auto sm:max-w-lg sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create Checklist</h3>
              <button
                onClick={() => setShowCreateChecklistModal(false)}
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  value={newChecklistName}
                  onChange={(e) => setNewChecklistName(e.target.value)}
                  placeholder="Inspection follow-up checklist"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description (optional)</label>
                <textarea
                  value={newChecklistDescription}
                  onChange={(e) => setNewChecklistDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Template (optional)</label>
                <select
                  value={newChecklistTemplateId}
                  onChange={(e) => setNewChecklistTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  <option value="">Start blank</option>
                  {checklistTemplateOptions.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowCreateChecklistModal(false)}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={submitCreateChecklist}
                disabled={createChecklistMutation.isLoading || !newChecklistName.trim()}
                className="flex-1 rounded-lg bg-panda-primary px-4 py-2 text-white disabled:opacity-60"
              >
                {createChecklistMutation.isLoading ? 'Creating...' : 'Create Checklist'}
              </button>
            </div>
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
