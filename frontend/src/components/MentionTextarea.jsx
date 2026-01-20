import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../services/api';
import { AtSign } from 'lucide-react';

export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
  autoFocus = false,
  mentions = [],
  onMentionsChange,
}) {
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  // Search for users when typing @
  const { data: userSuggestions = [] } = useQuery({
    queryKey: ['userSearch', mentionQuery],
    queryFn: () => usersApi.searchUsers({ query: mentionQuery, limit: 10 }),
    enabled: showMentionDropdown && mentionQuery.length > 0,
  });

  // Handle textarea change
  const handleChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Check if typing @ for mention
    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtSymbol + 1);
      // Check if there's no space after @
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionQuery(textAfterAt);
        setShowMentionDropdown(true);
        setSelectedIndex(0);

        // Calculate dropdown position
        const textarea = textareaRef.current;
        if (textarea) {
          const rect = textarea.getBoundingClientRect();
          setMentionPosition({
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
          });
        }
      } else {
        setShowMentionDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (e) => {
    if (!showMentionDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % userSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + userSuggestions.length) % userSuggestions.length);
    } else if (e.key === 'Enter' && userSuggestions.length > 0) {
      e.preventDefault();
      insertMention(userSuggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowMentionDropdown(false);
    }
  };

  // Insert mention into textarea
  const insertMention = (user) => {
    const cursorPosition = textareaRef.current.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const textAfterCursor = value.substring(cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    const beforeMention = value.substring(0, lastAtSymbol);
    const mentionText = `@${user.firstName} ${user.lastName}`;
    const newValue = beforeMention + mentionText + ' ' + textAfterCursor;

    onChange(newValue);

    // Add to mentions array
    if (onMentionsChange && !mentions.find(m => m.id === user.id)) {
      onMentionsChange([...mentions, {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
      }]);
    }

    setShowMentionDropdown(false);
    setMentionQuery('');

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = lastAtSymbol + mentionText.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        !textareaRef.current.contains(e.target)
      ) {
        setShowMentionDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
        autoFocus={autoFocus}
      />

      {/* Mention Dropdown */}
      {showMentionDropdown && userSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
          style={{
            top: '100%',
            left: 0,
          }}
        >
          <div className="p-2 text-xs text-gray-500 border-b border-gray-100 flex items-center gap-1">
            <AtSign className="w-3 h-3" />
            Mention a user
          </div>
          {userSuggestions.map((user, index) => (
            <button
              key={user.id}
              onClick={() => insertMention(user)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
                index === selectedIndex ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                {user.firstName?.[0]}{user.lastName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {user.firstName} {user.lastName}
                </div>
                <div className="text-xs text-gray-500 truncate">{user.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
