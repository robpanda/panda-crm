import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { pmPortalApi, opportunitiesApi } from '../services/api';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  MapPin,
  Phone,
  Mail,
  User,
  Clock,
  CheckCircle,
  Circle,
  AlertTriangle,
  MessageSquare,
  Image,
  FileText,
  Wrench,
  Send,
  ExternalLink,
  RefreshCw,
  Loader2,
  CheckSquare,
  Square,
  Globe,
  Camera,
  X,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Receipt,
  PieChart,
  CalendarDays,
  List,
  Grid,
  Home,
  ClipboardList,
  ImageIcon,
  Menu,
  ArrowLeft,
  ChevronDown,
  Check,
  MessageCircle,
  MailIcon,
  Plus,
  FolderPlus,
} from 'lucide-react';

// Calendar View Types
const CALENDAR_VIEWS = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  ALL: 'all',
};

// Status Filters
const STATUS_FILTERS = [
  { id: 'all', label: 'All', color: 'bg-gray-100 text-gray-700' },
  { id: 'onboarding', label: 'Onboarding', color: 'bg-blue-100 text-blue-700', stages: ['CONTRACT_SIGNED', 'PERMIT_PENDING'] },
  { id: 'working', label: 'Working', color: 'bg-amber-100 text-amber-700', stages: ['IN_PRODUCTION', 'MATERIALS_ORDERED'] },
  { id: 'workorder', label: 'Work Order', color: 'bg-purple-100 text-purple-700', stages: ['WORK_ORDER_CREATED'] },
  { id: 'audit', label: 'Job Audit', color: 'bg-orange-100 text-orange-700', stages: ['FINAL_INSPECTION', 'JOB_AUDIT'] },
  { id: 'invoiced', label: 'Invoiced', color: 'bg-green-100 text-green-700', stages: ['INVOICED', 'PAYMENT_PENDING'] },
  { id: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-600', stages: ['COMPLETED', 'CLOSED_WON'] },
];

// Detect mobile device
const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

// Quick Date Helpers
const getQuickDateRange = (filter) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (filter) {
    case 'today':
      return { start: today, end: today };
    case 'thisWeek': {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start, end };
    }
    case 'nextWeek': {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay() + 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start, end };
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start, end };
    }
    default:
      return null;
  }
};

// Calendar Component with View Modes
function PMCalendar({ selectedDate, onSelectDate, calendarData, calendarView, onViewChange }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [quickFilter, setQuickFilter] = useState(null);

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    // Add padding for first week
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    // Add days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  }, [currentMonth]);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const handleQuickFilter = (filter) => {
    setQuickFilter(filter);
    const range = getQuickDateRange(filter);
    if (range) {
      onSelectDate(range.start.toISOString().split('T')[0], range.end.toISOString().split('T')[0]);
    } else {
      onSelectDate(null, null);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Calendar View Toggle */}
      <div className="flex border-b border-gray-200">
        {Object.entries(CALENDAR_VIEWS).map(([key, value]) => (
          <button
            key={key}
            onClick={() => onViewChange(value)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              calendarView === value
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {key.charAt(0) + key.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Quick Date Filters */}
      <div className="p-2 border-b border-gray-200 flex flex-wrap gap-1">
        {[
          { id: 'today', label: 'Today' },
          { id: 'thisWeek', label: 'This Week' },
          { id: 'nextWeek', label: 'Next Week' },
          { id: 'thisMonth', label: 'This Month' },
        ].map((filter) => (
          <button
            key={filter.id}
            onClick={() => handleQuickFilter(quickFilter === filter.id ? null : filter.id)}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${
              quickFilter === filter.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-medium text-sm">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-gray-500 font-medium py-1">{d}</div>
          ))}
          {daysInMonth.map((day, i) => {
            if (!day) return <div key={i} />;
            const dateStr = day.toISOString().split('T')[0];
            const count = calendarData?.[dateStr] || 0;
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            return (
              <button
                key={i}
                onClick={() => {
                  setQuickFilter(null);
                  onSelectDate(dateStr);
                }}
                className={`
                  relative p-1 rounded text-xs
                  ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}
                `}
              >
                {day.getDate()}
                {count > 0 && (
                  <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center
                    ${isSelected ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Project Card Component
function ProjectCard({ project, isSelected, onClick }) {
  const progress = project.workflowProgress || { completed: 0, total: 1 };
  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate">
            {project.contact?.firstName} {project.contact?.lastName || project.name}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {project.jobId || 'No Job #'}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          project.stage === 'COMPLETED' ? 'bg-green-100 text-green-700' :
          project.stage === 'IN_PRODUCTION' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {project.stage?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center text-xs text-gray-500 mb-2">
        <MapPin className="w-3 h-3 mr-1" />
        <span className="truncate">{project.city}, {project.state}</span>
      </div>
      {project.installDate && (
        <div className="flex items-center text-xs text-gray-500 mb-2">
          <Calendar className="w-3 h-3 mr-1" />
          <span>{new Date(project.installDate).toLocaleDateString()}</span>
        </div>
      )}
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">
        {progress.completed}/{progress.total} stages complete
      </p>
    </button>
  );
}

// Workflow Stage Component
function WorkflowStage({ stage, onUpdate, isUpdating }) {
  const [showInspection, setShowInspection] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState('');

  const getStageIcon = () => {
    if (stage.status === 'completed') return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (stage.status === 'skipped') return <X className="w-5 h-5 text-gray-400" />;
    if (stage.status === 'in_progress') return <Clock className="w-5 h-5 text-blue-500" />;
    return <Circle className="w-5 h-5 text-gray-300" />;
  };

  const getTypeLabel = () => {
    switch (stage.stageType) {
      case 'auto_sms': return { label: 'Auto SMS', color: 'bg-purple-100 text-purple-700' };
      case 'auto_email': return { label: 'Auto Email', color: 'bg-indigo-100 text-indigo-700' };
      case 'manual': return { label: 'Manual', color: 'bg-amber-100 text-amber-700' };
      case 'optional': return { label: 'Optional', color: 'bg-gray-100 text-gray-600' };
      default: return { label: stage.stageType, color: 'bg-gray-100 text-gray-600' };
    }
  };

  const typeInfo = getTypeLabel();

  return (
    <div className={`p-4 rounded-lg border ${
      stage.status === 'completed' ? 'border-green-200 bg-green-50' :
      stage.status === 'in_progress' ? 'border-blue-200 bg-blue-50' :
      'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getStageIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="font-medium text-gray-900">{stage.stageName}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
          </div>
          {stage.description && (
            <p className="text-sm text-gray-500 mb-2">{stage.description}</p>
          )}
          {stage.completedAt && (
            <p className="text-xs text-green-600">
              Completed {new Date(stage.completedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
              {stage.completedBy && ` by ${stage.completedBy.firstName} ${stage.completedBy.lastName}`}
            </p>
          )}
          {stage.passedInspection !== null && (
            <p className={`text-xs ${stage.passedInspection ? 'text-green-600' : 'text-red-600'}`}>
              Inspection: {stage.passedInspection ? 'Passed' : 'Failed'}
              {stage.inspectionNotes && ` - ${stage.inspectionNotes}`}
            </p>
          )}
        </div>
        {stage.status !== 'completed' && stage.status !== 'skipped' && (
          <div className="flex-shrink-0 flex gap-2 flex-wrap">
            {stage.stageType === 'manual' && stage.stageName.toLowerCase().includes('inspection') ? (
              <button
                onClick={() => setShowInspection(!showInspection)}
                className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
              >
                Inspect
              </button>
            ) : (
              <>
                <button
                  onClick={() => onUpdate(stage.id, { status: 'completed' })}
                  disabled={isUpdating}
                  className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                >
                  Complete
                </button>
                {stage.stageType === 'optional' && (
                  <button
                    onClick={() => onUpdate(stage.id, { status: 'skipped' })}
                    disabled={isUpdating}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    Skip
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Inspection form */}
      {showInspection && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <textarea
            value={inspectionNotes}
            onChange={(e) => setInspectionNotes(e.target.value)}
            placeholder="Inspection notes..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg mb-2"
            rows={2}
          />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                onUpdate(stage.id, { status: 'completed', passedInspection: true, inspectionNotes });
                setShowInspection(false);
              }}
              disabled={isUpdating}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Pass
            </button>
            <button
              onClick={() => {
                onUpdate(stage.id, { status: 'completed', passedInspection: false, inspectionNotes });
                setShowInspection(false);
              }}
              disabled={isUpdating}
              className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              Fail
            </button>
            <button
              onClick={() => setShowInspection(false)}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Photo Gallery Component with Selection
function PhotoGallery({ photos, galleries, projectId, onCreateGallery }) {
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [galleryName, setGalleryName] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);

  const togglePhotoSelection = (photoId) => {
    setSelectedPhotos((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
  };

  const handleCreateGallery = () => {
    if (galleryName.trim() && selectedPhotos.length > 0) {
      onCreateGallery({
        name: galleryName,
        photoIds: selectedPhotos,
        expiresInDays: 30,
      });
      setGalleryName('');
      setSelectedPhotos([]);
      setShowGalleryModal(false);
      setIsSelecting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Selection Controls */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Photos ({photos?.length || 0})</h3>
        <div className="flex gap-2">
          {isSelecting ? (
            <>
              <button
                onClick={() => {
                  setIsSelecting(false);
                  setSelectedPhotos([]);
                }}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowGalleryModal(true)}
                disabled={selectedPhotos.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <FolderPlus className="w-3 h-3" />
                Create Gallery ({selectedPhotos.length})
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsSelecting(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              <CheckSquare className="w-3 h-3" />
              Select
            </button>
          )}
        </div>
      </div>

      {/* Photo Grid */}
      {photos?.length > 0 ? (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={`relative aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer group ${
                selectedPhotos.includes(photo.id) ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => isSelecting && togglePhotoSelection(photo.id)}
            >
              <img
                src={photo.url || photo.thumbnailUrl}
                alt={photo.caption || ''}
                className="w-full h-full object-cover"
              />
              {isSelecting && (
                <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center ${
                  selectedPhotos.includes(photo.id)
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white/80 border-gray-300'
                }`}>
                  {selectedPhotos.includes(photo.id) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
              )}
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-white text-xs truncate">{photo.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Camera className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No photos yet</p>
        </div>
      )}

      {/* Existing Galleries */}
      {galleries?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Galleries</h4>
          <div className="space-y-2">
            {galleries.map((gallery) => (
              <a
                key={gallery.id}
                href={`/gallery/${gallery.publicToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-sm border border-gray-200"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">{gallery.name}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500">
                  <span>{gallery.photoCount || gallery.photos?.length || 0} photos</span>
                  <ExternalLink className="w-3 h-3" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Create Gallery Modal */}
      {showGalleryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-md">
            <h3 className="font-medium text-lg mb-4">Create Gallery</h3>
            <input
              type="text"
              value={galleryName}
              onChange={(e) => setGalleryName(e.target.value)}
              placeholder="Gallery name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              autoFocus
            />
            <p className="text-sm text-gray-500 mb-4">
              {selectedPhotos.length} photos selected. Gallery will be shared with customer.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowGalleryModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGallery}
                disabled={!galleryName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create Gallery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Messages Tab Component with SMS/Email Toggle
function MessagesTab({ messages, loading, onSendMessage, sending }) {
  const [messageTab, setMessageTab] = useState('homeowner');
  const [channel, setChannel] = useState('sms');
  const [newMessage, setNewMessage] = useState('');

  const filteredMessages = messages?.filter(
    (msg) => messageTab === 'homeowner'
      ? ['SMS_SENT', 'SMS_RECEIVED', 'EMAIL_SENT', 'EMAIL_RECEIVED'].includes(msg.activityType)
      : ['CREW_SMS', 'CREW_EMAIL'].includes(msg.activityType)
  ) || [];

  return (
    <div className="space-y-4">
      {/* Recipient Toggle */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
        <button
          onClick={() => setMessageTab('homeowner')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
            messageTab === 'homeowner'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <User className="w-4 h-4" />
          Homeowner
        </button>
        <button
          onClick={() => setMessageTab('crew')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
            messageTab === 'crew'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Crew
        </button>
      </div>

      {/* Channel Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setChannel('sms')}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-full transition-colors ${
            channel === 'sms'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <MessageCircle className="w-3 h-3" />
          SMS
        </button>
        <button
          onClick={() => setChannel('email')}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-full transition-colors ${
            channel === 'email'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <MailIcon className="w-3 h-3" />
          Email
        </button>
      </div>

      {/* Message List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No messages yet</p>
        ) : (
          filteredMessages.map((msg) => {
            const isOutgoing = msg.activityType?.includes('SENT');
            return (
              <div
                key={msg.id}
                className={`p-3 rounded-lg ${
                  isOutgoing ? 'bg-blue-50 ml-4' : 'bg-gray-100 mr-4'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium ${isOutgoing ? 'text-blue-600' : 'text-gray-600'}`}>
                    {isOutgoing ? 'Sent' : 'Received'}
                    {msg.activityType?.includes('SMS') ? ' via SMS' : ' via Email'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(msg.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{msg.description}</p>
              </div>
            );
          })
        )}
      </div>

      {/* Send Message Form */}
      <div className="border-t border-gray-200 pt-4">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={`Send ${channel.toUpperCase()} to ${messageTab}...`}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
          rows={3}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={() => {
              if (newMessage.trim()) {
                onSendMessage({
                  type: messageTab,
                  channel,
                  message: newMessage,
                });
                setNewMessage('');
              }
            }}
            disabled={!newMessage.trim() || sending}
            className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm disabled:opacity-50 ${
              channel === 'sms'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Send className="w-4 h-4" />
            Send {channel.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

// Mobile Bottom Navigation
function MobileBottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'projects', icon: Home, label: 'Projects' },
    { id: 'workflow', icon: ClipboardList, label: 'Workflow' },
    { id: 'messages', icon: MessageSquare, label: 'Messages' },
    { id: 'photos', icon: ImageIcon, label: 'Photos' },
    { id: 'financials', icon: DollarSign, label: 'Financials' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-40">
      <div className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center py-2 px-1 ${
              activeTab === tab.id ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            <span className="text-[10px] mt-1">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Main PM Portal Component
export default function PMPortal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // State
  const [selectedDateStart, setSelectedDateStart] = useState(null);
  const [selectedDateEnd, setSelectedDateEnd] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('workflow');
  const [statusFilter, setStatusFilter] = useState('all');
  const [calendarView, setCalendarView] = useState(CALENDAR_VIEWS.MONTH);
  const [showSidebar, setShowSidebar] = useState(!isMobile());
  const [mobileView, setMobileView] = useState('projects'); // For mobile navigation

  const currentDate = new Date();

  // Handle date selection (single date or range)
  const handleDateSelect = (startDate, endDate = null) => {
    setSelectedDateStart(startDate);
    setSelectedDateEnd(endDate);
  };

  // Queries
  const { data: calendarData } = useQuery({
    queryKey: ['pmPortalCalendar', currentDate.getMonth() + 1, currentDate.getFullYear()],
    queryFn: () => pmPortalApi.getCalendar(currentDate.getMonth() + 1, currentDate.getFullYear()),
  });

  const { data: projectsData, isLoading: loadingProjects, refetch: refetchProjects } = useQuery({
    queryKey: ['pmPortalProjects', selectedDateStart, selectedDateEnd, searchQuery, statusFilter],
    queryFn: () => pmPortalApi.getProjects({
      startDate: selectedDateStart,
      endDate: selectedDateEnd || selectedDateStart,
      search: searchQuery || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }),
  });

  const { data: projectDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['pmPortalProject', selectedProject?.id],
    queryFn: () => pmPortalApi.getProject(selectedProject.id),
    enabled: !!selectedProject?.id,
  });

  const { data: workflowData, isLoading: loadingWorkflow, refetch: refetchWorkflow } = useQuery({
    queryKey: ['pmPortalWorkflow', selectedProject?.id],
    queryFn: () => pmPortalApi.getWorkflow(selectedProject.id),
    enabled: !!selectedProject?.id,
  });

  const { data: messagesData, isLoading: loadingMessages } = useQuery({
    queryKey: ['pmPortalMessages', selectedProject?.id],
    queryFn: () => pmPortalApi.getMessages(selectedProject.id),
    enabled: !!selectedProject?.id,
  });

  const { data: materialsData } = useQuery({
    queryKey: ['pmPortalMaterials', selectedProject?.id],
    queryFn: () => pmPortalApi.getMaterials(selectedProject.id),
    enabled: !!selectedProject?.id,
  });

  const { data: photosData, refetch: refetchPhotos } = useQuery({
    queryKey: ['pmPortalPhotos', selectedProject?.id],
    queryFn: () => pmPortalApi.getPhotos(selectedProject.id),
    enabled: !!selectedProject?.id,
  });

  const { data: financialsData, isLoading: loadingFinancials } = useQuery({
    queryKey: ['pmPortalFinancials', selectedProject?.id],
    queryFn: () => pmPortalApi.getFinancials(selectedProject.id),
    enabled: !!selectedProject?.id,
  });

  // Mutations
  const updateStageMutation = useMutation({
    mutationFn: ({ stageId, data }) => pmPortalApi.updateWorkflowStage(selectedProject.id, stageId, data),
    onSuccess: () => {
      refetchWorkflow();
      refetchProjects();
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (data) => pmPortalApi.sendMessage(selectedProject.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['pmPortalMessages', selectedProject?.id]);
    },
  });

  const createGalleryMutation = useMutation({
    mutationFn: (data) => opportunitiesApi.createPortalGallery(selectedProject.id, data),
    onSuccess: () => {
      refetchPhotos();
    },
  });

  const projects = projectsData?.data || [];
  const workflow = workflowData?.data || [];
  const messages = messagesData?.data || [];
  const materials = materialsData?.data || {};
  const photos = photosData?.data || { photos: [], galleries: [] };
  const financials = financialsData?.data || {
    contractTotal: 0,
    materialCost: 0,
    laborCost: 0,
    grossProfit: 0,
    grossMargin: 0,
    invoices: [],
    payments: [],
    totalInvoiced: 0,
    totalPaid: 0,
    balance: 0,
  };

  // Filter projects by status
  const filteredProjects = useMemo(() => {
    if (statusFilter === 'all') return projects;
    const statusConfig = STATUS_FILTERS.find((s) => s.id === statusFilter);
    if (!statusConfig?.stages) return projects;
    return projects.filter((p) => statusConfig.stages.includes(p.stage));
  }, [projects, statusFilter]);

  // Calculate overall progress
  const completedStages = workflow.filter((s) => s.status === 'completed').length;
  const totalStages = workflow.length;
  const progressPercent = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  // Mobile view handling
  const handleMobileTabChange = (tab) => {
    setMobileView(tab);
    if (tab !== 'projects') {
      setActiveTab(tab);
    }
  };

  // Desktop layout
  const renderDesktopLayout = () => (
    <div className="h-[calc(100vh-64px)] flex bg-gray-50">
      {/* Left Panel - Calendar & Project List */}
      <div className={`${showSidebar ? 'w-80' : 'w-0'} flex-shrink-0 border-r border-gray-200 bg-white flex flex-col transition-all overflow-hidden`}>
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900 mb-1">PM Portal</h1>
          <p className="text-sm text-gray-500">Manage your projects</p>
        </div>

        {/* Calendar */}
        <div className="p-4 border-b border-gray-200">
          <PMCalendar
            selectedDate={selectedDateStart}
            onSelectDate={handleDateSelect}
            calendarData={calendarData?.data}
            calendarView={calendarView}
            onViewChange={setCalendarView}
          />
          {selectedDateStart && (
            <button
              onClick={() => handleDateSelect(null)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700"
            >
              Clear date filter
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="p-4 border-b border-gray-200">
          <p className="text-xs font-medium text-gray-500 mb-2">STATUS</p>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status.id}
                onClick={() => setStatusFilter(status.id)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  statusFilter === status.id
                    ? status.color
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loadingProjects ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No projects found</p>
              {(selectedDateStart || statusFilter !== 'all') && (
                <p className="text-xs">Try different filters</p>
              )}
            </div>
          ) : (
            filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isSelected={selectedProject?.id === project.id}
                onClick={() => setSelectedProject(project)}
              />
            ))
          )}
        </div>
      </div>

      {/* Toggle Sidebar Button */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white border border-gray-200 rounded-r-lg shadow-sm hover:bg-gray-50 hidden md:block"
        style={{ left: showSidebar ? '320px' : '0' }}
      >
        {showSidebar ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Center Panel - Project Details */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedProject ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Select a project</p>
              <p className="text-sm">Choose a project from the list to view details</p>
            </div>
          </div>
        ) : (
          <>
            {/* Project Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedProject.contact?.firstName} {selectedProject.contact?.lastName}
                  </h2>
                  <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                    <span className="font-medium text-blue-600">{selectedProject.jobId}</span>
                    <span className="flex items-center">
                      <MapPin className="w-3 h-3 mr-1" />
                      {selectedProject.street}, {selectedProject.city}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600">{progressPercent}%</div>
                  <div className="text-xs text-gray-500">{completedStages}/{totalStages} stages</div>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-200 px-4">
              <div className="flex gap-1 overflow-x-auto">
                {[
                  { id: 'workflow', label: 'Workflow', icon: CheckSquare },
                  { id: 'materials', label: 'Materials', icon: FileText },
                  { id: 'messages', label: 'Messages', icon: MessageSquare },
                  { id: 'photos', label: 'Photos', icon: ImageIcon },
                  { id: 'financials', label: 'Financials', icon: DollarSign },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'workflow' && (
                <div className="space-y-3">
                  {loadingWorkflow ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : workflow.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No workflow stages defined</p>
                    </div>
                  ) : (
                    workflow.map((stage) => (
                      <WorkflowStage
                        key={stage.id}
                        stage={stage}
                        onUpdate={(stageId, data) => updateStageMutation.mutate({ stageId, data })}
                        isUpdating={updateStageMutation.isPending}
                      />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'materials' && (
                <div className="space-y-4">
                  {/* Measurements */}
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Measurements</h3>
                    {materials.measurements?.length > 0 ? (
                      <div className="grid gap-2">
                        {materials.measurements.map((m) => (
                          <div key={m.id} className="p-3 bg-white rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{m.provider}</span>
                              <span className="text-sm text-gray-500">
                                {new Date(m.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            {m.totalSquares && (
                              <p className="text-sm text-gray-600">{m.totalSquares} squares</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No measurements available</p>
                    )}
                  </div>

                  {/* Materials */}
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Materials</h3>
                    {materials.materials?.length > 0 ? (
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Item</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {materials.materials.map((item) => (
                              <tr key={item.id}>
                                <td className="px-3 py-2">{item.product?.name || item.description}</td>
                                <td className="px-3 py-2 text-right">{item.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No materials listed</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'messages' && (
                <MessagesTab
                  messages={messages}
                  loading={loadingMessages}
                  onSendMessage={(data) => sendMessageMutation.mutate(data)}
                  sending={sendMessageMutation.isPending}
                />
              )}

              {activeTab === 'photos' && (
                <PhotoGallery
                  photos={photos.photos}
                  galleries={photos.galleries}
                  projectId={selectedProject?.id}
                  onCreateGallery={(data) => createGalleryMutation.mutate(data)}
                />
              )}

              {activeTab === 'financials' && (
                <div className="space-y-4">
                  {loadingFinancials ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <>
                      {/* Financial Summary Cards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Contract Value</span>
                            <DollarSign className="w-4 h-4 text-blue-500" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900">
                            ${financials.contractTotal?.toLocaleString() || '0'}
                          </p>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Total Costs</span>
                            <Receipt className="w-4 h-4 text-red-500" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900">
                            ${((financials.materialCost || 0) + (financials.laborCost || 0)).toLocaleString()}
                          </p>
                          <div className="text-xs text-gray-500 mt-1">
                            <span>Materials: ${financials.materialCost?.toLocaleString() || '0'}</span>
                            <span className="mx-1">•</span>
                            <span>Labor: ${financials.laborCost?.toLocaleString() || '0'}</span>
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Gross Profit</span>
                            {financials.grossProfit >= 0 ? (
                              <TrendingUp className="w-4 h-4 text-green-500" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                          <p className={`text-2xl font-bold ${financials.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${financials.grossProfit?.toLocaleString() || '0'}
                          </p>
                          <p className={`text-xs ${financials.grossMargin >= 30 ? 'text-green-600' : financials.grossMargin >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                            {financials.grossMargin?.toFixed(1) || '0'}% margin
                          </p>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Balance Due</span>
                            <CreditCard className="w-4 h-4 text-amber-500" />
                          </div>
                          <p className={`text-2xl font-bold ${financials.balance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            ${financials.balance?.toLocaleString() || '0'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Paid: ${financials.totalPaid?.toLocaleString() || '0'}
                          </p>
                        </div>
                      </div>

                      {/* Profit Margin Gauge */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Profit Margin Analysis</h4>
                        <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              financials.grossMargin >= 30 ? 'bg-green-500' :
                              financials.grossMargin >= 20 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, financials.grossMargin || 0))}%` }}
                          />
                          {/* Target markers */}
                          <div className="absolute top-0 left-[20%] h-full w-0.5 bg-gray-400" title="Minimum (20%)"/>
                          <div className="absolute top-0 left-[30%] h-full w-0.5 bg-green-700" title="Target (30%)" />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>0%</span>
                          <span>20% min</span>
                          <span>30% target</span>
                          <span>50%+</span>
                        </div>
                      </div>

                      {/* Invoices */}
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                          <h4 className="text-sm font-medium text-gray-700">Invoices</h4>
                        </div>
                        {financials.invoices?.length > 0 ? (
                          <div className="divide-y divide-gray-200">
                            {financials.invoices.map((invoice) => (
                              <div key={invoice.id} className="px-4 py-3 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{invoice.invoiceNumber}</p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-medium text-gray-900">
                                    ${invoice.totalAmount?.toLocaleString() || '0'}
                                  </p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    invoice.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                    invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-700' :
                                    invoice.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {invoice.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center text-sm text-gray-500">
                            No invoices yet
                          </div>
                        )}
                      </div>

                      {/* Payments */}
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                          <h4 className="text-sm font-medium text-gray-700">Payment History</h4>
                        </div>
                        {financials.payments?.length > 0 ? (
                          <div className="divide-y divide-gray-200">
                            {financials.payments.map((payment) => (
                              <div key={payment.id} className="px-4 py-3 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {payment.paymentMethod || 'Payment'}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(payment.paymentDate || payment.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-medium text-green-600">
                                    +${payment.amount?.toLocaleString() || '0'}
                                  </p>
                                  {payment.referenceNumber && (
                                    <p className="text-xs text-gray-500">Ref: {payment.referenceNumber}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center text-sm text-gray-500">
                            No payments recorded
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right Panel - Customer Info & Quick Actions */}
      {selectedProject && (
        <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white flex-col hidden lg:flex">
          {/* Customer Info */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Customer</h3>
            <div className="space-y-2">
              <div className="flex items-center text-sm">
                <User className="w-4 h-4 text-gray-400 mr-2" />
                <span>{selectedProject.contact?.firstName} {selectedProject.contact?.lastName}</span>
              </div>
              {(selectedProject.contact?.phone || selectedProject.contact?.mobilePhone) && (
                <a
                  href={`tel:${selectedProject.contact.phone || selectedProject.contact.mobilePhone}`}
                  className="flex items-center text-sm text-blue-600 hover:text-blue-700"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  {selectedProject.contact.phone || selectedProject.contact.mobilePhone}
                </a>
              )}
              {selectedProject.contact?.email && (
                <a
                  href={`mailto:${selectedProject.contact.email}`}
                  className="flex items-center text-sm text-blue-600 hover:text-blue-700"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  <span className="truncate">{selectedProject.contact.email}</span>
                </a>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={async () => {
                  try {
                    const result = await opportunitiesApi.generatePortalLink(selectedProject.id, { expiresInDays: 30 });
                    if (result.success) {
                      await navigator.clipboard.writeText(result.data.url);
                      alert('Portal link copied to clipboard!');
                    }
                  } catch (err) {
                    console.error('Failed to generate portal link:', err);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
              >
                <Globe className="w-4 h-4" />
                Generate Portal Link
              </button>
              <a
                href={`/jobs/${selectedProject.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                <ExternalLink className="w-4 h-4" />
                View in CRM
              </a>
            </div>
          </div>

          {/* Photo Preview */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="font-medium text-gray-900 mb-3">Recent Photos</h3>
            {photos.photos?.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {photos.photos.slice(0, 6).map((photo) => (
                  <div
                    key={photo.id}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                  >
                    <img
                      src={photo.url || photo.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <Camera className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                <p className="text-xs">No photos</p>
              </div>
            )}
            {photos.photos?.length > 6 && (
              <button
                onClick={() => setActiveTab('photos')}
                className="w-full mt-2 text-xs text-blue-600 hover:text-blue-700"
              >
                View all {photos.photos.length} photos →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Mobile layout
  const renderMobileLayout = () => (
    <div className="min-h-screen bg-gray-50 pb-16">
      {mobileView === 'projects' ? (
        <>
          {/* Mobile Header */}
          <div className="bg-white border-b border-gray-200 p-4 sticky top-0 z-30">
            <h1 className="text-lg font-bold text-gray-900 mb-3">PM Portal</h1>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
            </div>

            {/* Quick Date Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {[
                { id: 'today', label: 'Today' },
                { id: 'thisWeek', label: 'This Week' },
                { id: 'nextWeek', label: 'Next Week' },
                { id: 'thisMonth', label: 'This Month' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => {
                    const range = getQuickDateRange(filter.id);
                    if (range) {
                      handleDateSelect(
                        range.start.toISOString().split('T')[0],
                        range.end.toISOString().split('T')[0]
                      );
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-full whitespace-nowrap"
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Status Filters */}
            <div className="flex gap-2 overflow-x-auto mt-2">
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status.id}
                  onClick={() => setStatusFilter(status.id)}
                  className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap ${
                    statusFilter === status.id ? status.color : 'bg-gray-50 text-gray-500'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project List */}
          <div className="p-4 space-y-2">
            {loadingProjects ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No projects found</p>
              </div>
            ) : (
              filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isSelected={selectedProject?.id === project.id}
                  onClick={() => {
                    setSelectedProject(project);
                    setMobileView('workflow');
                  }}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {/* Mobile Project Detail Header */}
          <div className="bg-white border-b border-gray-200 p-4 sticky top-0 z-30">
            <button
              onClick={() => setMobileView('projects')}
              className="flex items-center text-blue-600 mb-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to projects
            </button>
            {selectedProject && (
              <>
                <h2 className="font-bold text-gray-900">
                  {selectedProject.contact?.firstName} {selectedProject.contact?.lastName}
                </h2>
                <p className="text-sm text-gray-500">{selectedProject.jobId}</p>
                {/* Progress bar */}
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{progressPercent}% complete</p>
              </>
            )}
          </div>

          {/* Mobile Tab Content */}
          <div className="p-4">
            {mobileView === 'workflow' && (
              <div className="space-y-3">
                {workflow.map((stage) => (
                  <WorkflowStage
                    key={stage.id}
                    stage={stage}
                    onUpdate={(stageId, data) => updateStageMutation.mutate({ stageId, data })}
                    isUpdating={updateStageMutation.isPending}
                  />
                ))}
              </div>
            )}
            {mobileView === 'messages' && (
              <MessagesTab
                messages={messages}
                loading={loadingMessages}
                onSendMessage={(data) => sendMessageMutation.mutate(data)}
                sending={sendMessageMutation.isPending}
              />
            )}
            {mobileView === 'photos' && (
              <PhotoGallery
                photos={photos.photos}
                galleries={photos.galleries}
                projectId={selectedProject?.id}
                onCreateGallery={(data) => createGalleryMutation.mutate(data)}
              />
            )}
            {mobileView === 'financials' && (
              <div className="space-y-4">
                {/* Compact Financial Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Contract</p>
                    <p className="text-lg font-bold">${financials.contractTotal?.toLocaleString() || '0'}</p>
                  </div>
                  <div className="bg-white rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Balance</p>
                    <p className={`text-lg font-bold ${financials.balance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      ${financials.balance?.toLocaleString() || '0'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav activeTab={mobileView} onTabChange={handleMobileTabChange} />
    </div>
  );

  // Responsive rendering
  return typeof window !== 'undefined' && window.innerWidth < 768
    ? renderMobileLayout()
    : renderDesktopLayout();
}
