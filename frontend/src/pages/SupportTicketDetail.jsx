import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft,
  Send,
  Paperclip,
  X,
  Download,
  ExternalLink,
  Clock,
  CheckCircle,
  AlertCircle,
  Circle,
  Pause,
  MessageSquare,
  User,
  Calendar,
  Tag,
  Link2,
  Image as ImageIcon,
} from 'lucide-react';
import api from '../services/api';

const STATUS_CONFIG = {
  NEW: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: Circle },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  WAITING_FOR_USER: { label: 'Waiting for You', color: 'bg-purple-100 text-purple-700', icon: MessageSquare },
  ON_HOLD: { label: 'On Hold', color: 'bg-gray-100 text-gray-700', icon: Pause },
  RESOLVED: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  CLOSED: { label: 'Closed', color: 'bg-gray-200 text-gray-600', icon: CheckCircle },
};

const PRIORITY_CONFIG = {
  LOW: { label: 'Low', color: 'text-gray-500' },
  MEDIUM: { label: 'Medium', color: 'text-blue-500' },
  HIGH: { label: 'High', color: 'text-orange-500' },
  URGENT: { label: 'Urgent', color: 'text-red-500' },
};

export default function SupportTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadTicketDetail();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadTicketDetail = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/support/tickets/${id}`);
      setTicket(response.data.ticket);
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Failed to load ticket:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && attachments.length === 0) return;

    try {
      setSending(true);

      const messageData = {
        message: newMessage.trim(),
        attachments: attachments.map(a => ({
          file_name: a.name,
          file_url: a.url,
          file_size: a.size,
          file_type: a.type,
        })),
      };

      await api.post(`/support/tickets/${id}/messages`, messageData);

      setNewMessage('');
      setAttachments([]);
      await loadTicketDetail();
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);

    try {
      // Upload files
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await api.post('/support/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        return {
          name: file.name,
          size: file.size,
          type: file.type,
          url: response.data.url,
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      setAttachments([...attachments, ...uploadedFiles]);
    } catch (error) {
      console.error('Failed to upload files:', error);
      alert('Failed to upload files. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const isAdmin = user?.roleType?.toLowerCase() === 'admin' ||
                  user?.role?.name?.toLowerCase()?.includes('admin');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Ticket not found</h3>
        <button
          onClick={() => navigate('/support')}
          className="text-panda-primary hover:underline"
        >
          Back to Support
        </button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.NEW;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/support')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Support
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Messages */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Header */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-mono text-gray-500">
                    #{ticket.ticket_number}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${statusConfig.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusConfig.label}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {ticket.subject}
                </h1>
                <p className="text-gray-600">{ticket.description}</p>
              </div>
            </div>

            {/* Ticket Screenshot */}
            {ticket.screenshot_url && (
              <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                <img
                  src={ticket.screenshot_url}
                  alt="Page screenshot"
                  className="w-full"
                />
              </div>
            )}

            {/* Initial Attachments */}
            {ticket.attachments && ticket.attachments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {ticket.attachments.map((attachment, index) => (
                  <a
                    key={index}
                    href={attachment.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm"
                  >
                    <Paperclip className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">{attachment.file_name}</span>
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Conversation</h2>
            </div>

            <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>No messages yet. Start the conversation below.</p>
                </div>
              ) : (
                messages.map((message) => {
                  const isCurrentUser = message.user_id === user?.id;
                  const isSystemMessage = message.is_internal || message.is_resolution;

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] ${isCurrentUser ? 'order-2' : 'order-1'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-8 h-8 bg-gradient-to-r from-panda-primary to-panda-secondary rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {message.user?.firstName?.[0] || '?'}
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {message.user?.firstName} {message.user?.lastName}
                            {message.user?.role && (
                              <span className="ml-2 text-xs text-gray-500">
                                ({message.user.role.name})
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatTime(message.created_at)}
                          </span>
                        </div>
                        <div
                          className={`p-4 rounded-lg ${
                            isSystemMessage
                              ? 'bg-yellow-50 border border-yellow-200'
                              : isCurrentUser
                              ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
                              : 'bg-gray-50 border border-gray-200'
                          }`}
                        >
                          <p className={`text-sm whitespace-pre-wrap ${
                            isCurrentUser && !isSystemMessage ? 'text-white' : 'text-gray-900'
                          }`}>
                            {message.message}
                          </p>
                          {message.is_resolution && (
                            <div className="mt-2 pt-2 border-t border-yellow-300">
                              <div className="flex items-center gap-2 text-xs text-yellow-800">
                                <CheckCircle className="w-4 h-4" />
                                <span className="font-medium">Marked as resolution</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            {ticket.status !== 'CLOSED' && (
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100">
                {/* Attachments Preview */}
                {attachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {attachments.map((attachment, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg"
                      >
                        <Paperclip className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-700 max-w-[200px] truncate">
                          {attachment.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary resize-none"
                      disabled={sending}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                      title="Attach files"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <button
                      type="submit"
                      disabled={sending || (!newMessage.trim() && attachments.length === 0)}
                      className="p-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Sidebar - Ticket Details */}
        <div className="space-y-6">
          {/* Ticket Info */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Ticket Details</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Tag className="w-4 h-4" />
                  Status
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${statusConfig.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusConfig.label}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <AlertCircle className="w-4 h-4" />
                  Priority
                </div>
                <span className={`text-sm font-medium ${PRIORITY_CONFIG[ticket.priority].color}`}>
                  {PRIORITY_CONFIG[ticket.priority].label}
                </span>
              </div>

              {ticket.category && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Tag className="w-4 h-4" />
                    Category
                  </div>
                  <span className="text-sm text-gray-900">{ticket.category}</span>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Calendar className="w-4 h-4" />
                  Created
                </div>
                <span className="text-sm text-gray-900">{formatTime(ticket.created_at)}</span>
              </div>

              {ticket.assigned_to && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <User className="w-4 h-4" />
                    Assigned To
                  </div>
                  <span className="text-sm text-gray-900">
                    {ticket.assigned_to.firstName} {ticket.assigned_to.lastName}
                  </span>
                </div>
              )}

              {ticket.page_url && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Link2 className="w-4 h-4" />
                    Page
                  </div>
                  <a
                    href={ticket.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-panda-primary hover:underline flex items-center gap-1"
                  >
                    View Page
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Related Help Article */}
          {ticket.related_article && (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Related Help Article</h3>
              <button
                onClick={() => navigate(`/help#${ticket.related_article.id}`)}
                className="text-left w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <h4 className="font-medium text-gray-900 mb-1">
                  {ticket.related_article.title}
                </h4>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {ticket.related_article.summary}
                </p>
              </button>
            </div>
          )}

          {/* Quick Actions (Admin Only) */}
          {isAdmin && (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Admin Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => navigate(`/admin/support/ticket/${id}`)}
                  className="w-full px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors text-sm"
                >
                  Manage Ticket
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
