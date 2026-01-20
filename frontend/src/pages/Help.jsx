import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Book,
  FileText,
  Video,
  HelpCircle,
  ChevronRight,
  Clock,
  Star,
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  Briefcase,
  Phone,
  Settings,
  Shield,
  Bot,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import api from '../services/api';

// Helper function to parse inline markdown (bold text)
const parseInlineMarkdown = (text) => {
  const parts = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    // Add the bold text as a React element
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  // Add remaining text after the last match
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

export default function Help() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [featuredArticles, setFeaturedArticles] = useState([]);
  const [recentArticles, setRecentArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [feedback, setFeedback] = useState({});

  // Check if user is admin
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const roleType = user?.roleType?.toLowerCase() || '';
  const isAdmin = roleName?.toLowerCase()?.includes('admin') ||
                  roleType === 'admin' || roleType === 'executive';

  useEffect(() => {
    loadHelpData();
  }, []);

  const loadHelpData = async () => {
    try {
      setLoading(true);
      const [articlesRes, categoriesRes] = await Promise.all([
        api.get('/help/articles'),
        api.get('/help/categories'),
      ]);

      setArticles(articlesRes.data.articles || []);
      setCategories(categoriesRes.data.categories || defaultCategories);
      setFeaturedArticles(articlesRes.data.articles?.filter(a => a.featured) || []);
      setRecentArticles(articlesRes.data.articles?.slice(0, 5) || []);
    } catch (error) {
      console.error('Failed to load help data:', error);
      // Use default data if API fails
      setCategories(defaultCategories);
      setArticles(defaultArticles);
      setFeaturedArticles(defaultArticles.filter(a => a.featured));
      setRecentArticles(defaultArticles.slice(0, 5));
    } finally {
      setLoading(false);
    }
  };

  const defaultCategories = [
    { id: 'getting-started', name: 'Getting Started', icon: Book, count: 0, color: 'bg-blue-500' },
    { id: 'contact-center', name: 'Contact Center', icon: Phone, count: 0, color: 'bg-green-500' },
    { id: 'scheduling', name: 'Scheduling & Dispatch', icon: Calendar, count: 0, color: 'bg-purple-500' },
    { id: 'sales', name: 'Sales & Opportunities', icon: Briefcase, count: 0, color: 'bg-orange-500' },
    { id: 'commissions', name: 'Commissions', icon: DollarSign, count: 0, color: 'bg-yellow-500' },
    { id: 'service-admin', name: 'Service Admin', icon: Users, count: 0, color: 'bg-indigo-500' },
    { id: 'admin', name: 'Administration', icon: Settings, count: 0, color: 'bg-red-500' },
    { id: 'integrations', name: 'Integrations', icon: Shield, count: 0, color: 'bg-teal-500' },
  ];

  // No default articles - only show real data from the database
  const defaultArticles = [];

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          article.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleFeedback = async (articleId, isHelpful) => {
    setFeedback(prev => ({ ...prev, [articleId]: isHelpful }));
    try {
      await api.post(`/help/articles/${articleId}/feedback`, { helpful: isHelpful });
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const getCategoryIcon = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.icon || FileText;
  };

  if (selectedArticle) {
    return (
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => setSelectedArticle(null)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ChevronRight className="w-5 h-5 rotate-180 mr-1" />
          Back to Help Center
        </button>

        {/* Article */}
        <article className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                  {categories.find(c => c.id === selectedArticle.category)?.name || selectedArticle.category}
                </span>
                {selectedArticle.aiGenerated && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-600 text-xs font-medium rounded">
                    <Sparkles className="w-3 h-3" />
                    AI Generated
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{selectedArticle.title}</h1>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-6 pb-6 border-b">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Updated {selectedArticle.updatedAt}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              {selectedArticle.views} views
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="w-4 h-4" />
              {selectedArticle.helpful}% found helpful
            </span>
          </div>

          {/* Content */}
          <div className="prose prose-gray max-w-none">
            {selectedArticle.content.split('\n').map((line, index) => {
              if (line.startsWith('# ')) {
                return <h1 key={index} className="text-2xl font-bold mt-8 mb-4">{parseInlineMarkdown(line.replace('# ', ''))}</h1>;
              } else if (line.startsWith('## ')) {
                return <h2 key={index} className="text-xl font-semibold mt-6 mb-3">{parseInlineMarkdown(line.replace('## ', ''))}</h2>;
              } else if (line.startsWith('### ')) {
                return <h3 key={index} className="text-lg font-medium mt-4 mb-2">{parseInlineMarkdown(line.replace('### ', ''))}</h3>;
              } else if (line.startsWith('- [ ] ')) {
                return (
                  <div key={index} className="flex items-center gap-2 ml-4">
                    <input type="checkbox" disabled className="rounded" />
                    <span>{parseInlineMarkdown(line.replace('- [ ] ', ''))}</span>
                  </div>
                );
              } else if (line.startsWith('- ')) {
                return <li key={index} className="ml-4">{parseInlineMarkdown(line.replace('- ', ''))}</li>;
              } else if (line.trim() === '') {
                return <br key={index} />;
              } else {
                return <p key={index} className="mb-2">{parseInlineMarkdown(line)}</p>;
              }
            })}
          </div>

          {/* Feedback */}
          <div className="mt-8 pt-6 border-t">
            <p className="text-gray-600 mb-3">Was this article helpful?</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleFeedback(selectedArticle.id, true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  feedback[selectedArticle.id] === true
                    ? 'bg-green-100 border-green-300 text-green-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
                Yes
              </button>
              <button
                onClick={() => handleFeedback(selectedArticle.id, false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  feedback[selectedArticle.id] === false
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
                No
              </button>
            </div>
          </div>
        </article>

        {/* Related Articles */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Related Articles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {articles
              .filter(a => a.category === selectedArticle.category && a.id !== selectedArticle.id)
              .slice(0, 4)
              .map(article => (
                <button
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className="bg-white rounded-lg border border-gray-100 p-4 text-left hover:border-panda-primary transition-colors"
                >
                  <h4 className="font-medium text-gray-900">{article.title}</h4>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{article.summary}</p>
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-panda-primary to-panda-secondary rounded-xl p-8 text-white">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-2">How can we help you?</h1>
          <p className="text-white/80 mb-6">
            Search our knowledge base or browse categories below
          </p>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for help articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>
        </div>

        {/* Admin Link */}
        {isAdmin && (
          <div className="mt-4 text-center">
            <Link
              to="/admin/help"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              <Settings className="w-4 h-4" />
              Manage Help Articles
            </Link>
          </div>
        )}
      </div>

      {/* Categories Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Browse by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(categories.length > 0 ? categories : defaultCategories).map((category) => {
            const Icon = category.icon || FileText;
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id === selectedCategory ? 'all' : category.id)}
                className={`p-4 rounded-xl border transition-all text-left ${
                  selectedCategory === category.id
                    ? 'bg-panda-primary/10 border-panda-primary'
                    : 'bg-white border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${category.color || 'bg-gray-500'} flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-medium text-gray-900">{category.name}</h3>
                <p className="text-sm text-gray-500">{category.count} articles</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Featured Articles */}
      {selectedCategory === 'all' && !searchQuery && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Featured Articles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(featuredArticles.length > 0 ? featuredArticles : defaultArticles.filter(a => a.featured)).map((article) => {
              const CategoryIcon = getCategoryIcon(article.category);
              return (
                <button
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <CategoryIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    {article.aiGenerated && (
                      <span className="flex items-center gap-1 text-xs text-purple-600">
                        <Sparkles className="w-3 h-3" />
                        AI
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 mb-2">{article.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{article.summary}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                    <span>{article.views} views</span>
                    <span>{article.helpful}% helpful</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Results / Category Articles */}
      {(searchQuery || selectedCategory !== 'all') && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {searchQuery ? `Search Results for "${searchQuery}"` : `${categories.find(c => c.id === selectedCategory)?.name} Articles`}
            </h2>
            {selectedCategory !== 'all' && (
              <button
                onClick={() => setSelectedCategory('all')}
                className="text-sm text-panda-primary hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>

          {filteredArticles.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-gray-900 font-medium mb-1">No articles found</h3>
              <p className="text-gray-500 text-sm">Try a different search term or browse categories</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {filteredArticles.map((article, index) => {
                const CategoryIcon = getCategoryIcon(article.category);
                return (
                  <button
                    key={article.id}
                    onClick={() => setSelectedArticle(article)}
                    className={`w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-colors ${
                      index > 0 ? 'border-t border-gray-100' : ''
                    }`}
                  >
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <CategoryIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">{article.title}</h3>
                        {article.aiGenerated && (
                          <Sparkles className="w-3 h-3 text-purple-500" />
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{article.summary}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Recent Articles */}
      {selectedCategory === 'all' && !searchQuery && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            Recently Updated
          </h2>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {(recentArticles.length > 0 ? recentArticles : defaultArticles.slice(0, 5)).map((article, index) => (
              <button
                key={article.id}
                onClick={() => setSelectedArticle(article)}
                className={`w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors ${
                  index > 0 ? 'border-t border-gray-100' : ''
                }`}
              >
                <div>
                  <h3 className="font-medium text-gray-900">{article.title}</h3>
                  <p className="text-sm text-gray-500">Updated {article.updatedAt}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contact Support */}
      <div className="bg-gray-50 rounded-xl p-6 text-center">
        <MessageSquare className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <h3 className="font-medium text-gray-900 mb-1">Can't find what you're looking for?</h3>
        <p className="text-sm text-gray-500 mb-4">Our support team is here to help</p>
        <a
          href="mailto:support@pandaexteriors.com"
          className="inline-flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Contact Support
        </a>
      </div>
    </div>
  );
}
