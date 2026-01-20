import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Mail, Search, Filter, Plus, Send, Inbox, CheckCircle, AlertCircle,
  Clock, RefreshCw, User, Building2, X, Reply, Forward, Eye, Archive,
  Trash2, Star, StarOff, MailOpen, Calendar, Paperclip, MoreVertical
} from 'lucide-react';
import { emailsApi } from '../services/api';

// Status configurations
const statusConfig = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: Mail },
  QUEUED: { label: 'Queued', color: 'bg-blue-100 text-blue-700', icon: Clock },
  SENT: { label: 'Sent', color: 'bg-green-100 text-green-700', icon: Send },
  DELIVERED: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  OPENED: { label: 'Opened', color: 'bg-purple-100 text-purple-700', icon: MailOpen },
  CLICKED: { label: 'Clicked', color: 'bg-indigo-100 text-indigo-700', icon: Eye },
  BOUNCED: { label: 'Bounced', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  FAILED: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

const directionConfig = {
  INBOUND: { label: 'Received', color: 'bg-blue-50 text-blue-700', icon: Inbox },
  OUTBOUND: { label: 'Sent', color: 'bg-green-50 text-green-700', icon: Send },
};

export default function Emails() {
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [directionFilter, setDirectionFilter] = useState(searchParams.get('direction') || 'all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showComposeModal, setShowComposeModal] = useState(false);

  // Load data
  useEffect(() => {
    loadEmails();
    loadStats();
  }, [page, statusFilter, directionFilter]);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        direction: directionFilter !== 'all' ? directionFilter : undefined,
      };

      const response = await emailsApi.getEmails(params);
      setEmails(response.data || []);
      setTotalPages(response.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Error loading emails:', err);
      setError(err.message || 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await emailsApi.getEmailStats();
      setStats(response.data || response);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadEmails();
  };

  const handleSendEmail = async (email) => {
    try {
      await emailsApi.sendEmail(email.id);
      loadEmails();
      loadStats();
    } catch (err) {
      setError(err.message || 'Failed to send email');
    }
  };

  const handleDeleteEmail = async (email) => {
    if (!window.confirm('Are you sure you want to delete this email?')) return;
    try {
      await emailsApi.deleteEmail(email.id);
      loadEmails();
      loadStats();
    } catch (err) {
      setError(err.message || 'Failed to delete email');
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const now = new Date();
    const emailDate = new Date(date);
    const diffMs = now - emailDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return emailDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } else if (diffDays < 7) {
      return emailDate.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return emailDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const truncateText = (text, maxLength = 60) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emails</h1>
          <p className="text-gray-500">View and manage email communications</p>
        </div>
        <button
          onClick={() => setShowComposeModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span>Compose Email</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Sent</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalSent || 0}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <Send className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Received</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalReceived || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Inbox className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Open Rate</p>
                <p className="text-2xl font-bold text-purple-600">{stats.openRate || 0}%</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <MailOpen className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Click Rate</p>
                <p className="text-2xl font-bold text-indigo-600">{stats.clickRate || 0}%</p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Eye className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Bounced</p>
                <p className="text-2xl font-bold text-red-600">{stats.bounced || 0}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emails..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
          </form>

          {/* Direction Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={directionFilter}
              onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
            >
              <option value="all">All Emails</option>
              <option value="INBOUND">Received</option>
              <option value="OUTBOUND">Sent</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
          >
            <option value="all">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="OPENED">Opened</option>
            <option value="BOUNCED">Bounced</option>
          </select>

          {/* Refresh */}
          <button
            onClick={() => { loadEmails(); loadStats(); }}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Emails List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto" />
          </div>
        ) : emails.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <Mail className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900">No emails found</p>
            <p className="mt-1">Compose your first email to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {emails.map((email) => {
              const StatusIcon = statusConfig[email.status]?.icon || Mail;
              const isOutbound = email.direction === 'OUTBOUND';
              const isRead = email.openedAt || email.status === 'OPENED' || email.status === 'CLICKED';

              return (
                <div
                  key={email.id}
                  className={`flex items-center px-6 py-4 hover:bg-gray-50 cursor-pointer ${!isRead && !isOutbound ? 'bg-blue-50/30' : ''}`}
                  onClick={() => { setSelectedEmail(email); setShowDetailModal(true); }}
                >
                  {/* Direction Icon */}
                  <div className={`p-2 rounded-lg mr-4 ${isOutbound ? 'bg-green-100' : 'bg-blue-100'}`}>
                    {isOutbound ? (
                      <Send className="w-4 h-4 text-green-600" />
                    ) : (
                      <Inbox className="w-4 h-4 text-blue-600" />
                    )}
                  </div>

                  {/* Email Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${!isRead && !isOutbound ? 'text-gray-900' : 'text-gray-600'}`}>
                        {isOutbound ? email.toAddresses?.[0] || 'Unknown' : email.fromAddress || 'Unknown'}
                      </span>
                      {email.hasAttachments && (
                        <Paperclip className="w-4 h-4 text-gray-400" />
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs ${statusConfig[email.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                        {statusConfig[email.status]?.label || email.status}
                      </span>
                    </div>
                    <div className="flex items-center mt-1">
                      <span className={`${!isRead && !isOutbound ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {truncateText(email.subject, 50)}
                      </span>
                      <span className="mx-2 text-gray-300">-</span>
                      <span className="text-gray-500 truncate">
                        {truncateText(email.bodyText || '', 80)}
                      </span>
                    </div>
                  </div>

                  {/* Contact/Account Badge */}
                  {email.contact && (
                    <Link
                      to={`/contacts/${email.contactId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hidden md:flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded-lg mr-4 hover:bg-gray-200"
                    >
                      <User className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-600">{email.contact.firstName}</span>
                    </Link>
                  )}

                  {/* Date */}
                  <div className="text-sm text-gray-500 whitespace-nowrap ml-4">
                    {formatDate(email.sentAt || email.createdAt)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1 ml-4" onClick={(e) => e.stopPropagation()}>
                    {email.status === 'DRAFT' && (
                      <button
                        onClick={() => handleSendEmail(email)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        title="Send"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteEmail(email)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedEmail && (
        <EmailDetailModal
          email={selectedEmail}
          onClose={() => { setShowDetailModal(false); setSelectedEmail(null); }}
          onReply={() => { setShowDetailModal(false); setShowComposeModal(true); }}
          onForward={() => { setShowDetailModal(false); setShowComposeModal(true); }}
        />
      )}

      {/* Compose Modal */}
      {showComposeModal && (
        <ComposeEmailModal
          replyTo={selectedEmail}
          onClose={() => { setShowComposeModal(false); setSelectedEmail(null); }}
          onSuccess={() => { setShowComposeModal(false); setSelectedEmail(null); loadEmails(); loadStats(); }}
        />
      )}
    </div>
  );
}

// Email Detail Modal
function EmailDetailModal({ email, onClose, onReply, onForward }) {
  const formatDateTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const isOutbound = email.direction === 'OUTBOUND';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">{email.subject}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* From/To */}
          <div className="space-y-2">
            <div className="flex items-start">
              <span className="text-sm text-gray-500 w-16">From:</span>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-panda-primary/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-panda-primary" />
                </div>
                <div>
                  <span className="font-medium text-gray-900">{email.fromName || email.fromAddress}</span>
                  {email.fromName && (
                    <span className="text-gray-500 ml-2">&lt;{email.fromAddress}&gt;</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start">
              <span className="text-sm text-gray-500 w-16">To:</span>
              <span className="text-gray-900">{email.toAddresses?.join(', ') || '-'}</span>
            </div>
            {email.ccAddresses?.length > 0 && (
              <div className="flex items-start">
                <span className="text-sm text-gray-500 w-16">Cc:</span>
                <span className="text-gray-600">{email.ccAddresses.join(', ')}</span>
              </div>
            )}
            <div className="flex items-start">
              <span className="text-sm text-gray-500 w-16">Date:</span>
              <span className="text-gray-600">{formatDateTime(email.sentAt || email.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {email.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-gray-700 font-sans">{email.bodyText || 'No content'}</pre>
          )}
        </div>

        {/* Tracking Info */}
        {isOutbound && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center space-x-6 text-sm">
              {email.deliveredAt && (
                <div className="flex items-center space-x-1 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Delivered</span>
                </div>
              )}
              {email.openedAt && (
                <div className="flex items-center space-x-1 text-purple-600">
                  <MailOpen className="w-4 h-4" />
                  <span>Opened {new Date(email.openedAt).toLocaleDateString()}</span>
                </div>
              )}
              {email.clickedAt && (
                <div className="flex items-center space-x-1 text-indigo-600">
                  <Eye className="w-4 h-4" />
                  <span>Clicked</span>
                </div>
              )}
              {email.bouncedAt && (
                <div className="flex items-center space-x-1 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>Bounced: {email.bounceReason || 'Unknown'}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 border-t border-gray-100 flex justify-between">
          <div className="flex space-x-2">
            <button
              onClick={onReply}
              className="flex items-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:opacity-90"
            >
              <Reply className="w-4 h-4" />
              <span>Reply</span>
            </button>
            <button
              onClick={onForward}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <Forward className="w-4 h-4" />
              <span>Forward</span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Compose Email Modal
function ComposeEmailModal({ replyTo, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    toAddresses: replyTo ? [replyTo.fromAddress] : [],
    ccAddresses: [],
    subject: replyTo ? `Re: ${replyTo.subject}` : '',
    bodyText: replyTo ? `\n\n---\nOn ${new Date(replyTo.sentAt).toLocaleDateString()}, ${replyTo.fromAddress} wrote:\n\n${replyTo.bodyText || ''}` : '',
  });
  const [toInput, setToInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAddRecipient = (e) => {
    e.preventDefault();
    if (toInput && !formData.toAddresses.includes(toInput)) {
      setFormData({ ...formData, toAddresses: [...formData.toAddresses, toInput] });
      setToInput('');
    }
  };

  const handleRemoveRecipient = (email) => {
    setFormData({ ...formData, toAddresses: formData.toAddresses.filter(e => e !== email) });
  };

  const handleSubmit = async (e, isDraft = false) => {
    e.preventDefault();
    if (formData.toAddresses.length === 0) {
      setError('Please add at least one recipient');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await emailsApi.createEmail(formData);
      if (!isDraft) {
        await emailsApi.sendEmail(response.data?.id || response.id);
      }
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {replyTo ? 'Reply' : 'New Email'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-lg min-h-[42px]">
              {formData.toAddresses.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center px-2 py-1 bg-panda-primary/10 text-panda-primary rounded-lg text-sm"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => handleRemoveRecipient(email)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRecipient(e); } }}
                placeholder={formData.toAddresses.length === 0 ? 'Add recipients...' : ''}
                className="flex-1 min-w-[150px] border-none focus:outline-none focus:ring-0 text-sm"
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              required
            />
          </div>

          {/* Body */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={formData.bodyText}
              onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              rows="12"
              required
            />
          </div>
        </form>

        <div className="p-4 border-t border-gray-100 flex justify-between">
          <button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={loading}
            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Save Draft
          </button>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={(e) => handleSubmit(e, false)}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Sending...' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
