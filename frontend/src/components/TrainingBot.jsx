import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  MessageCircle,
  X,
  Send,
  ThumbsUp,
  ThumbsDown,
  ChevronRight,
  Sparkles,
  HelpCircle,
  BookOpen,
  Minimize2,
  Maximize2,
  RefreshCw
} from 'lucide-react';

const API_URL = 'https://7paaginnvg.execute-api.us-east-2.amazonaws.com/prod';

export default function TrainingBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [hasInteracted, setHasInteracted] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load suggestions based on current page
  useEffect(() => {
    if (isOpen && !hasInteracted) {
      loadSuggestions();
    }
  }, [isOpen, location.pathname, hasInteracted]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const loadSuggestions = async () => {
    try {
      const response = await fetch(`${API_URL}/training-bot/suggestions?path=${encodeURIComponent(location.pathname)}`);
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      setSuggestions([
        "How do I get started?",
        "Give me an overview of the system",
        "What can I do on this page?"
      ]);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    setHasInteracted(true);
    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: text.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/training-bot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: messages.slice(-10),
          currentPath: location.pathname,
          userRole: user?.role?.toLowerCase().replace(/ /g, '_'),
          userId: user?.id,
          userName: user?.name || user?.email
        })
      });

      const data = await response.json();

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: data.response,
        suggestions: data.suggestions,
        actions: data.actions,
        responseId: data.responseId, // Server-generated ID for feedback tracking
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        text: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion);
  };

  const handleActionClick = (action) => {
    if (action.type === 'navigate' && action.path) {
      navigate(action.path);
      setIsOpen(false);
    }
  };

  const handleFeedback = async (messageId, responseId, helpful) => {
    try {
      await fetch(`${API_URL}/training-bot/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId: responseId || messageId.toString(), // Use server responseId if available
          helpful,
          userId: user?.id,
          userName: user?.name || user?.email
        })
      });

      // Update message to show feedback was given
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, feedbackGiven: helpful } : msg
      ));
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setHasInteracted(false);
    loadSuggestions();
  };

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setIsMinimized(false);
    }
  };

  // Parse markdown-like formatting
  const formatMessage = (text) => {
    if (!text) return '';

    // Split into lines
    const lines = text.split('\n');
    const elements = [];
    let inList = false;
    let listItems = [];

    lines.forEach((line, index) => {
      // Bold
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // Inline code
      line = line.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>');

      // Numbered list
      const numberedMatch = line.match(/^(\d+)\.\s(.+)/);
      if (numberedMatch) {
        if (!inList) {
          inList = true;
          listItems = [];
        }
        listItems.push(numberedMatch[2]);
        return;
      }

      // Bullet list
      const bulletMatch = line.match(/^[-•]\s(.+)/);
      if (bulletMatch) {
        if (!inList) {
          inList = true;
          listItems = [];
        }
        listItems.push(bulletMatch[1]);
        return;
      }

      // End of list
      if (inList && listItems.length > 0) {
        elements.push(
          <ol key={`list-${index}`} className="list-decimal list-inside space-y-1 my-2">
            {listItems.map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ol>
        );
        inList = false;
        listItems = [];
      }

      // Regular line
      if (line.trim()) {
        elements.push(
          <p key={index} className="mb-2" dangerouslySetInnerHTML={{ __html: line }} />
        );
      }
    });

    // Handle remaining list
    if (inList && listItems.length > 0) {
      elements.push(
        <ol key="list-final" className="list-decimal list-inside space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ol>
      );
    }

    return elements;
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        id="training-bot-trigger"
        onClick={toggleOpen}
        className={`fixed bottom-6 left-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-300 hover:scale-105 ${
          isOpen
            ? 'bg-gray-800 text-white'
            : 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
        }`}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <HelpCircle className="w-6 h-6" />
        )}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          className={`fixed z-50 bg-white rounded-xl shadow-2xl transition-all duration-300 overflow-hidden ${
            isMinimized
              ? 'bottom-24 left-6 w-80 h-14'
              : 'bottom-24 left-6 w-[400px] h-[600px] max-h-[calc(100vh-120px)]'
          }`}
          style={{
            maxWidth: 'calc(100vw - 48px)',
          }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-panda-primary to-panda-secondary text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Training Assistant</h3>
                {!isMinimized && (
                  <p className="text-xs text-white/80">Ask me anything about Panda CRM</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isMinimized && (
                <button
                  onClick={resetConversation}
                  className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                  title="Reset conversation"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages area */}
              <div className="h-[calc(100%-180px)] overflow-y-auto p-4 bg-gray-50">
                {messages.length === 0 ? (
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-panda-primary to-panda-secondary rounded-full flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-gray-700">
                            Hi! I'm your Panda CRM training assistant. I can help you:
                          </p>
                          <ul className="mt-2 space-y-1 text-sm text-gray-600">
                            <li className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-panda-primary" />
                              Learn how to use any feature
                            </li>
                            <li className="flex items-center gap-2">
                              <MessageCircle className="w-4 h-4 text-panda-primary" />
                              Get step-by-step guidance
                            </li>
                            <li className="flex items-center gap-2">
                              <HelpCircle className="w-4 h-4 text-panda-primary" />
                              Troubleshoot issues
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Suggested questions:</p>
                        {suggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="w-full text-left p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group"
                          >
                            <span className="text-sm text-gray-700">{suggestion}</span>
                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-panda-primary transition-colors" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg p-3 ${
                            message.type === 'user'
                              ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
                              : 'bg-white shadow-sm'
                          }`}
                        >
                          {message.type === 'user' ? (
                            <p className="text-sm">{message.text}</p>
                          ) : (
                            <>
                              <div className="text-sm text-gray-700">
                                {formatMessage(message.text)}
                              </div>

                              {/* Actions */}
                              {message.actions && message.actions.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {message.actions.map((action, i) => (
                                    <button
                                      key={i}
                                      onClick={() => handleActionClick(action)}
                                      className="text-xs px-3 py-1.5 bg-panda-primary text-white rounded-full hover:bg-panda-primary/90 transition-colors"
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Feedback */}
                              {!message.feedbackGiven && message.feedbackGiven !== false && (
                                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
                                  <span className="text-xs text-gray-400">Helpful?</span>
                                  <button
                                    onClick={() => handleFeedback(message.id, message.responseId, true)}
                                    className="p-1 text-gray-400 hover:text-green-500 transition-colors"
                                  >
                                    <ThumbsUp className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleFeedback(message.id, message.responseId, false)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <ThumbsDown className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                              {message.feedbackGiven !== undefined && (
                                <div className="mt-2 text-xs text-gray-400 text-right">
                                  Thanks for your feedback!
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Loading indicator */}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-panda-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-panda-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-panda-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Follow-up suggestions */}
                    {!isLoading && suggestions.length > 0 && messages.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {suggestions.slice(0, 3).map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full hover:border-panda-primary hover:text-panda-primary transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask a question..."
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary text-sm"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isLoading}
                    className="w-10 h-10 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-shadow"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
