import { useState, useEffect, useCallback } from 'react';
import { X, Camera, Paperclip, AlertCircle, Loader, Sparkles, Lightbulb, Search } from 'lucide-react';
import html2canvas from 'html2canvas';
import { debounce } from 'lodash';

const CATEGORIES = [
  'Technical Issue',
  'Feature Request',
  'Bug Report',
  'Account Question',
  'Data Issue',
  'Integration Problem',
  'Performance Issue',
  'Other',
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low', description: 'Minor issue, no urgency' },
  { value: 'MEDIUM', label: 'Medium', description: 'Normal priority' },
  { value: 'HIGH', label: 'High', description: 'Urgent, affecting work' },
  { value: 'URGENT', label: 'Urgent', description: 'Critical, blocking work' },
];

// Page context mapping for auto-fill suggestions
const PAGE_CONTEXT_MAP = {
  '/leads': { category: 'Data Issue', contextHint: 'Lead Management' },
  '/opportunities': { category: 'Data Issue', contextHint: 'Opportunities/Jobs' },
  '/accounts': { category: 'Account Question', contextHint: 'Account Management' },
  '/contacts': { category: 'Data Issue', contextHint: 'Contact Management' },
  '/work-orders': { category: 'Data Issue', contextHint: 'Work Orders' },
  '/integrations': { category: 'Integration Problem', contextHint: 'Integrations' },
  '/admin': { category: 'Technical Issue', contextHint: 'Admin Settings' },
  '/reports': { category: 'Data Issue', contextHint: 'Reports & Analytics' },
  '/dashboard': { category: 'Performance Issue', contextHint: 'Dashboard' },
  '/bamboogli': { category: 'Integration Problem', contextHint: 'Bamboogli Messaging' },
};

export default function CreateTicketModal({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    category: '',
    priority: 'MEDIUM',
  });
  const [screenshot, setScreenshot] = useState(null);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // AI Enhancement states
  const [aiSuggestions, setAiSuggestions] = useState({
    category: null,
    priority: null,
    reasoning: null,
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [similarTickets, setSimilarTickets] = useState([]);
  const [searchingTickets, setSearchingTickets] = useState(false);
  const [pageContext, setPageContext] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    // Capture page info and determine context
    const pageUrl = window.location.href;
    const pathname = window.location.pathname;
    const browserInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenSize: `${window.screen.width}x${window.screen.height}`,
    };

    // Find matching page context
    let context = null;
    for (const [path, ctx] of Object.entries(PAGE_CONTEXT_MAP)) {
      if (pathname.startsWith(path)) {
        context = ctx;
        break;
      }
    }
    setPageContext(context);

    // Auto-fill category from page context if available
    if (context?.category && !formData.category) {
      setFormData(prev => ({
        ...prev,
        pageUrl,
        browserInfo: JSON.stringify(browserInfo),
        category: context.category,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        pageUrl,
        browserInfo: JSON.stringify(browserInfo),
      }));
    }
  }, []);

  // AI-powered suggestion using GPT-4o-mini
  const getAiSuggestions = useCallback(
    debounce(async (text) => {
      if (!text || text.length < 20) {
        setAiSuggestions({ category: null, priority: null, reasoning: null });
        return;
      }

      setAiLoading(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/support/ai/suggestions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: JSON.stringify({
            subject: formData.subject,
            description: text,
            categories: CATEGORIES,
            priorities: PRIORITIES.map(p => p.value),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setAiSuggestions({
            category: data.suggestedCategory,
            priority: data.suggestedPriority,
            reasoning: data.reasoning,
          });
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Failed to get AI suggestions:', error);
      } finally {
        setAiLoading(false);
      }
    }, 1000),
    [formData.subject]
  );

  // Search for similar tickets
  const searchSimilarTickets = useCallback(
    debounce(async (text) => {
      if (!text || text.length < 10) {
        setSimilarTickets([]);
        return;
      }

      setSearchingTickets(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE || ''}/api/support/tickets/similar?q=${encodeURIComponent(text)}`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setSimilarTickets(data.tickets || []);
        }
      } catch (error) {
        console.error('Failed to search similar tickets:', error);
      } finally {
        setSearchingTickets(false);
      }
    }, 800),
    []
  );

  // Handle description change with AI suggestions
  const handleDescriptionChange = (e) => {
    const value = e.target.value;
    setFormData({ ...formData, description: value });

    // Trigger AI suggestions and similar ticket search
    const combinedText = `${formData.subject} ${value}`;
    getAiSuggestions(combinedText);
    searchSimilarTickets(combinedText);
  };

  // Handle subject change
  const handleSubjectChange = (e) => {
    const value = e.target.value;
    setFormData({ ...formData, subject: value });

    // Trigger searches if we have enough text
    const combinedText = `${value} ${formData.description}`;
    if (combinedText.length > 15) {
      getAiSuggestions(combinedText);
      searchSimilarTickets(combinedText);
    }
  };

  // Apply AI suggestions
  const applyAiSuggestions = () => {
    setFormData(prev => ({
      ...prev,
      category: aiSuggestions.category || prev.category,
      priority: aiSuggestions.priority || prev.priority,
    }));
    setShowSuggestions(false);
  };

  const captureScreenshot = async () => {
    try {
      setCaptureLoading(true);

      // Hide modal temporarily
      const modal = document.getElementById('create-ticket-modal');
      if (modal) modal.style.display = 'none';

      // Wait a moment for modal to hide
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture screenshot
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scrollY: -window.scrollY,
        scrollX: -window.scrollX,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      });

      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setScreenshot({ blob, url });
        }
      }, 'image/png');

      // Show modal again
      if (modal) modal.style.display = '';
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      alert('Failed to capture screenshot. You can still submit the ticket without it.');
      const modal = document.getElementById('create-ticket-modal');
      if (modal) modal.style.display = '';
    } finally {
      setCaptureLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setAttachments([...attachments, ...files]);
  };

  const removeAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const removeScreenshot = () => {
    if (screenshot?.url) {
      URL.revokeObjectURL(screenshot.url);
    }
    setScreenshot(null);
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (formData.subject.length > 200) {
      newErrors.subject = 'Subject must be less than 200 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      setSubmitting(true);

      // Prepare form data for file upload
      const submitData = new FormData();
      submitData.append('subject', formData.subject);
      submitData.append('description', formData.description);
      submitData.append('category', formData.category);
      submitData.append('priority', formData.priority);
      submitData.append('pageUrl', formData.pageUrl);
      submitData.append('browserInfo', formData.browserInfo);

      // Add screenshot
      if (screenshot?.blob) {
        submitData.append('screenshot', screenshot.blob, 'screenshot.png');
      }

      // Add attachments
      attachments.forEach((file, index) => {
        submitData.append(`attachments`, file);
      });

      await onSubmit(submitData);
    } catch (error) {
      console.error('Failed to submit ticket:', error);
      alert(error.response?.data?.error || 'Failed to create ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        id="create-ticket-modal"
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Create Support Ticket</h2>
            {pageContext && (
              <p className="text-sm text-gray-500 mt-1">
                Context: <span className="font-medium text-panda-primary">{pageContext.contextHint}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={handleSubjectChange}
              placeholder="Brief description of your issue"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 ${
                errors.subject ? 'border-red-300' : 'border-gray-200'
              }`}
              maxLength={200}
            />
            {errors.subject && (
              <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.subject}
              </p>
            )}
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
                {aiSuggestions.category && formData.category !== aiSuggestions.category && (
                  <span className="ml-2 text-xs text-purple-600 font-normal">
                    AI suggests: {aiSuggestions.category}
                  </span>
                )}
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              >
                <option value="">Select category...</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority <span className="text-red-500">*</span>
                {aiSuggestions.priority && formData.priority !== aiSuggestions.priority && (
                  <span className="ml-2 text-xs text-purple-600 font-normal">
                    AI suggests: {aiSuggestions.priority}
                  </span>
                )}
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              >
                {PRIORITIES.map(priority => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label} - {priority.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* AI Suggestions Banner */}
          {showSuggestions && aiSuggestions.category && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-900">AI Suggestions</p>
                  <p className="text-sm text-purple-700 mt-1">{aiSuggestions.reasoning}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={applyAiSuggestions}
                      className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      Apply Suggestions
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSuggestions(false)}
                      className="px-3 py-1.5 text-purple-600 text-sm hover:bg-purple-100 rounded-lg transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description <span className="text-red-500">*</span>
              {aiLoading && (
                <span className="ml-2 text-xs text-gray-400 inline-flex items-center gap-1">
                  <Loader className="w-3 h-3 animate-spin" />
                  Analyzing...
                </span>
              )}
            </label>
            <textarea
              value={formData.description}
              onChange={handleDescriptionChange}
              placeholder="Please provide detailed information about your issue..."
              rows={6}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 resize-none ${
                errors.description ? 'border-red-300' : 'border-gray-200'
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.description}
              </p>
            )}
          </div>

          {/* Similar Tickets */}
          {similarTickets.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Search className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">Similar Tickets Found</p>
                  <p className="text-xs text-amber-700 mt-1">
                    These existing tickets might be related to your issue:
                  </p>
                  <ul className="mt-2 space-y-2">
                    {similarTickets.slice(0, 3).map(ticket => (
                      <li key={ticket.id} className="text-sm">
                        <a
                          href={`/support/${ticket.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-800 hover:text-amber-900 hover:underline"
                        >
                          <span className="font-mono text-xs bg-amber-100 px-1 rounded mr-2">
                            {ticket.ticket_number}
                          </span>
                          {ticket.subject}
                        </a>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                          ticket.status === 'RESOLVED' ? 'bg-green-100 text-green-700' :
                          ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {ticket.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Screenshot */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Screenshot (Optional)
            </label>
            {screenshot ? (
              <div className="relative border border-gray-200 rounded-lg overflow-hidden">
                <img
                  src={screenshot.url}
                  alt="Screenshot"
                  className="w-full"
                />
                <button
                  type="button"
                  onClick={removeScreenshot}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={captureScreenshot}
                disabled={captureLoading}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-panda-primary hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-gray-600 disabled:opacity-50"
              >
                {captureLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Capturing...
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    Capture Current Page
                  </>
                )}
              </button>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Automatically capture a screenshot of the current page to help us understand your issue
            </p>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Attachments (Optional)
            </label>
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="block w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-panda-primary hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-center gap-2 text-gray-600">
                <Paperclip className="w-5 h-5" />
                <span>Choose files or drag and drop</span>
              </div>
            </label>

            {/* Attachment List */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-400">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              <span className="text-red-500">*</span> Required fields
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Ticket'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
