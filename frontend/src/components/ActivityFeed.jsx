import { useState, useEffect, useRef } from 'react';
import { MessageSquare, CheckSquare, Calendar, Activity, Send, Sparkles, ChevronDown, ChevronUp, User, X } from 'lucide-react';
import { opportunitiesApi, integrationsApi } from '../services/api';

export default function ActivityFeed({ opportunityId, opportunity, onActivityAdded }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updateText, setUpdateText] = useState('');
  const [posting, setPosting] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionPosition, setMentionPosition] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const textareaRef = useRef(null);

  // Load activity data
  useEffect(() => {
    loadActivity();
    loadTeamMembers();
  }, [opportunityId]);

  // Generate AI summary when activities load
  useEffect(() => {
    if (activities.length > 0 && opportunity) {
      generateAiSummary();
    }
  }, [activities, opportunity]);

  const loadActivity = async () => {
    try {
      setLoading(true);
      const response = await opportunitiesApi.get(`/${opportunityId}/activity`);
      setActivities(response.data || []);
    } catch (error) {
      console.error('Error loading activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      // TODO: Replace with actual team members API call
      // For now, using mock data
      setTeamMembers([
        { id: '1', firstName: 'John', lastName: 'Doe', role: 'Sales Rep' },
        { id: '2', firstName: 'Jane', lastName: 'Smith', role: 'Project Manager' },
        { id: '3', firstName: 'Mike', lastName: 'Johnson', role: 'Production Manager' },
      ]);
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  const generateAiSummary = async () => {
    try {
      setLoadingAi(true);
      const response = await integrationsApi.post('/ai/activity-summary', {
        activities: activities.slice(0, 10),
        opportunity: {
          name: opportunity.name,
          stage: opportunity.stage,
          type: opportunity.type,
          status: opportunity.status,
        },
        context: { timestamp: new Date().toISOString() }
      });
      if (response.data?.summary) {
        setAiSummary(response.data.summary);
      }
    } catch (error) {
      console.error('Error generating AI summary:', error);
    } finally {
      setLoadingAi(false);
    }
  };

  const generateAiSuggestions = async () => {
    try {
      setLoadingAi(true);
      setShowSuggestions(true);
      const response = await integrationsApi.post('/ai/next-steps', {
        opportunity: {
          name: opportunity.name,
          stage: opportunity.stage,
          type: opportunity.type,
        },
        activities: activities.slice(0, 5),
        teamMembers: teamMembers,
      });
      if (response.data) {
        setAiSuggestions(response.data);
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleUpdateChange = (e) => {
    const text = e.target.value;
    setUpdateText(text);

    // Detect @mention trigger
    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol >= 0 && cursorPosition - lastAtSymbol <= 20) {
      const searchTerm = textBeforeCursor.substring(lastAtSymbol + 1);
      if (!searchTerm.includes(' ')) {
        setMentionSearch(searchTerm.toLowerCase());
        setMentionPosition(lastAtSymbol);
        setShowMentions(true);
        return;
      }
    }

    setShowMentions(false);
  };

  const selectMention = (member) => {
    const beforeMention = updateText.substring(0, mentionPosition);
    const afterMention = updateText.substring(textareaRef.current.selectionStart);
    const newText = `${beforeMention}@${member.firstName} ${member.lastName} ${afterMention}`;

    setUpdateText(newText);
    setShowMentions(false);
    setSelectedUsers([...selectedUsers, member]);

    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
      const newPosition = mentionPosition + member.firstName.length + member.lastName.length + 2;
      textareaRef.current?.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const removeMention = (userId) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
  };

  const applyAiDraft = (draftMessage) => {
    setUpdateText(draftMessage);
    textareaRef.current?.focus();
  };

  const handlePostUpdate = async () => {
    if (!updateText.trim()) return;

    try {
      setPosting(true);

      // Extract @mentioned user IDs from text
      const mentionedUserIds = selectedUsers.map(u => u.id);

      await opportunitiesApi.post(`/${opportunityId}/messages`, {
        message: updateText,
        mentionedUsers: mentionedUserIds,
      });

      // Clear form
      setUpdateText('');
      setSelectedUsers([]);
      setAiSuggestions(null);
      setShowSuggestions(false);

      // Reload activity
      await loadActivity();

      // Notify parent if callback provided
      if (onActivityAdded) {
        onActivityAdded();
      }
    } catch (error) {
      console.error('Error posting update:', error);
      alert('Failed to post update. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const filteredMembers = teamMembers.filter(member => {
    const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
    return fullName.includes(mentionSearch) && !selectedUsers.find(u => u.id === member.id);
  });

  return (
    <div className="space-y-4">
      {/* AI Summary Card */}
      {aiSummary && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">AI Summary</h3>
              <p className="text-sm text-gray-700">{aiSummary}</p>
            </div>
          </div>
        </div>
      )}

      {loadingAi && !aiSummary && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-gray-400 animate-pulse" />
            <span className="text-sm text-gray-500">Generating AI summary...</span>
          </div>
        </div>
      )}

      {/* Share an Update Composer */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Share an Update</h3>
            <button
              onClick={generateAiSuggestions}
              disabled={loadingAi}
              className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Assist</span>
            </button>
          </div>

          {/* Selected Mentions */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedUsers.map(user => (
                <span
                  key={user.id}
                  className="inline-flex items-center space-x-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                >
                  <User className="w-3 h-3" />
                  <span>{user.firstName} {user.lastName}</span>
                  <button
                    onClick={() => removeMention(user.id)}
                    className="hover:text-blue-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={updateText}
              onChange={handleUpdateChange}
              placeholder="Share a status update, next step, or @mention a team member..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
            />

            {/* @Mention Dropdown */}
            {showMentions && filteredMembers.length > 0 && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredMembers.map(member => (
                  <button
                    key={member.id}
                    onClick={() => selectMention(member)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                  >
                    <User className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {member.firstName} {member.lastName}
                      </div>
                      <div className="text-xs text-gray-500">{member.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI Suggestions Panel */}
        {showSuggestions && aiSuggestions && (
          <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-900">AI Suggestions</span>
              </div>
              <button
                onClick={() => setShowSuggestions(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            {aiSuggestions.nextSteps && aiSuggestions.nextSteps.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1">Next Steps:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {aiSuggestions.nextSteps.map((step, i) => (
                    <li key={i} className="flex items-start space-x-1">
                      <span>•</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiSuggestions.suggestedMentions && aiSuggestions.suggestedMentions.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1">Suggested Mentions:</p>
                <div className="flex flex-wrap gap-1">
                  {aiSuggestions.suggestedMentions.map((mention, i) => {
                    const member = teamMembers.find(m => m.id === mention.userId);
                    if (!member) return null;
                    return (
                      <button
                        key={i}
                        onClick={() => selectMention(member)}
                        className="px-2 py-1 bg-white border border-purple-300 rounded text-xs text-purple-700 hover:bg-purple-100"
                        title={mention.reason}
                      >
                        @{member.firstName} {member.lastName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {aiSuggestions.draftMessage && (
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Draft Message:</p>
                <button
                  onClick={() => applyAiDraft(aiSuggestions.draftMessage)}
                  className="w-full text-left px-2 py-1.5 bg-white border border-purple-300 rounded text-xs text-gray-700 hover:bg-purple-100"
                >
                  {aiSuggestions.draftMessage}
                </button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handlePostUpdate}
          disabled={posting || !updateText.trim()}
          className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {posting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Post Update</span>
            </>
          )}
        </button>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500 mt-2">Loading activity...</p>
          </div>
        ) : activities.length > 0 ? (
          activities.map((item, index) => (
            <div key={item.id || index} className="flex items-start space-x-3 py-3 border-b border-gray-100 last:border-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                item.type === 'note' ? 'bg-blue-100' :
                item.type === 'task' ? 'bg-yellow-100' :
                item.type === 'event' ? 'bg-purple-100' :
                'bg-gray-100'
              }`}>
                {item.type === 'note' && <MessageSquare className="w-4 h-4 text-blue-600" />}
                {item.type === 'task' && <CheckSquare className="w-4 h-4 text-yellow-600" />}
                {item.type === 'event' && <Calendar className="w-4 h-4 text-purple-600" />}
                {!['note', 'task', 'event'].includes(item.type) && <Activity className="w-4 h-4 text-gray-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900 truncate">{item.subject || item.title}</p>
                  <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                  </span>
                </div>
                {item.body && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.body}</p>
                )}
                {item.user && (
                  <p className="text-xs text-gray-400 mt-1">
                    by {item.user.firstName} {item.user.lastName}
                  </p>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-12 h-12 mx-auto text-gray-300 mb-2" />
            <p>No activity yet</p>
            <p className="text-sm mt-1">Be the first to share an update!</p>
          </div>
        )}
      </div>
    </div>
  );
}
