import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  Save,
  X,
  ChevronRight,
  FileText,
  Book,
  Phone,
  Calendar,
  Briefcase,
  DollarSign,
  Users,
  Settings,
  Shield,
  Clock,
  ThumbsUp,
  AlertCircle,
  CheckCircle,
  Code,
  GitBranch,
  Zap,
} from 'lucide-react';
import api from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

export default function AdminHelp() {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingArticle, setEditingArticle] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiGenerationLog, setAiGenerationLog] = useState([]);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [recentCodeChanges, setRecentCodeChanges] = useState([]);

  const defaultCategories = [
    { id: 'getting-started', name: 'Getting Started', icon: Book, color: 'bg-blue-500' },
    { id: 'contact-center', name: 'Contact Center', icon: Phone, color: 'bg-green-500' },
    { id: 'scheduling', name: 'Scheduling & Dispatch', icon: Calendar, color: 'bg-purple-500' },
    { id: 'sales', name: 'Sales & Opportunities', icon: Briefcase, color: 'bg-orange-500' },
    { id: 'commissions', name: 'Commissions', icon: DollarSign, color: 'bg-yellow-500' },
    { id: 'service-admin', name: 'Service Admin', icon: Users, color: 'bg-indigo-500' },
    { id: 'admin', name: 'Administration', icon: Settings, color: 'bg-red-500' },
    { id: 'integrations', name: 'Integrations', icon: Shield, color: 'bg-teal-500' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [articlesRes, categoriesRes, changesRes] = await Promise.all([
        api.get('/help/articles?includeUnpublished=true'),
        api.get('/help/categories'),
        api.get('/help/ai/recent-changes'),
      ]);

      setArticles(articlesRes.data.articles || defaultArticles);
      setCategories(categoriesRes.data.categories || defaultCategories);
      setRecentCodeChanges(changesRes.data.changes || []);
    } catch (error) {
      console.error('Failed to load help data:', error);
      setArticles(defaultArticles);
      setCategories(defaultCategories);
    } finally {
      setLoading(false);
    }
  };

  const defaultArticles = [
    {
      id: '1',
      title: 'Scheduling an Initial Inspection',
      category: 'contact-center',
      summary: 'Learn how to schedule initial inspection appointments for homeowners after lead conversion.',
      content: '# Scheduling an Initial Inspection\n\n...',
      published: true,
      featured: true,
      views: 1234,
      helpful: 89,
      updatedAt: '2025-01-02',
      aiGenerated: true,
      sourceFeature: 'scheduling',
    },
    {
      id: '2',
      title: 'Dispatching an Appointment',
      category: 'contact-center',
      summary: 'How to dispatch scheduled appointments and notify inspectors.',
      content: '# Dispatching an Appointment\n\n...',
      published: true,
      featured: true,
      views: 987,
      helpful: 76,
      updatedAt: '2025-01-02',
      aiGenerated: true,
      sourceFeature: 'scheduling',
    },
  ];

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          article.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSaveArticle = async (article) => {
    try {
      if (article.id) {
        await api.put(`/help/articles/${article.id}`, article);
      } else {
        await api.post('/help/articles', article);
      }
      await loadData();
      setEditingArticle(null);
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to save article:', error);
      alert('Failed to save article. Please try again.');
    }
  };

  const handleDeleteArticle = async (articleId) => {
    if (!confirm('Are you sure you want to delete this article?')) return;

    try {
      await api.delete(`/help/articles/${articleId}`);
      await loadData();
    } catch (error) {
      console.error('Failed to delete article:', error);
      alert('Failed to delete article. Please try again.');
    }
  };

  const handleTogglePublished = async (article) => {
    try {
      await api.put(`/help/articles/${article.id}`, {
        ...article,
        published: !article.published,
      });
      await loadData();
    } catch (error) {
      console.error('Failed to update article:', error);
    }
  };

  const handleGenerateFromCode = async () => {
    setGeneratingAI(true);
    setShowAIPanel(true);
    setAiGenerationLog([
      { type: 'info', message: 'Starting AI documentation generation...', time: new Date() },
    ]);

    try {
      // Simulated AI generation process - replace with actual API call
      const response = await api.post('/help/ai/generate', {
        analyzeCodeChanges: true,
      });

      setAiGenerationLog(prev => [
        ...prev,
        { type: 'success', message: `Generated ${response.data.articlesCreated} new articles`, time: new Date() },
        { type: 'success', message: `Updated ${response.data.articlesUpdated} existing articles`, time: new Date() },
      ]);

      await loadData();
    } catch (error) {
      console.error('AI generation failed:', error);
      setAiGenerationLog(prev => [
        ...prev,
        { type: 'error', message: `Generation failed: ${error.message}`, time: new Date() },
      ]);
    } finally {
      setGeneratingAI(false);
    }
  };

  const getCategoryIcon = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    const icons = { Book, Phone, Calendar, Briefcase, DollarSign, Users, Settings, Shield };
    return icons[category?.icon?.name] || FileText;
  };

  if (editingArticle || isCreating) {
    return (
      <ArticleEditor
        article={editingArticle}
        categories={categories}
        onSave={handleSaveArticle}
        onCancel={() => {
          setEditingArticle(null);
          setIsCreating(false);
        }}
      />
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Help Center Admin</h1>
            <p className="text-gray-500">Manage help articles and AI-generated documentation</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAIPanel(!showAIPanel)}
              className="flex items-center gap-2 px-4 py-2 border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            AI Generation
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Article
          </button>
        </div>
      </div>

      {/* AI Generation Panel */}
      {showAIPanel && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Sparkles className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">AI Documentation Generator</h3>
                <p className="text-sm text-gray-600">Automatically generate help articles from code changes</p>
              </div>
            </div>
            <button
              onClick={() => setShowAIPanel(false)}
              className="p-1 hover:bg-purple-100 rounded"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Recent Code Changes */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Recent Code Changes (Ready for Documentation)
            </h4>
            <div className="bg-white rounded-lg border border-purple-100 divide-y divide-purple-50">
              {recentCodeChanges.length > 0 ? recentCodeChanges.map((change, index) => (
                <div key={index} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Code className="w-4 h-4 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{change.feature}</p>
                      <p className="text-xs text-gray-500">{change.files?.length || 0} files changed</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    change.documented ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    {change.documented ? 'Documented' : 'Pending'}
                  </span>
                </div>
              )) : (
                <div className="p-4 text-center text-gray-500 text-sm">
                  <p>No undocumented code changes detected.</p>
                  <p className="text-xs mt-1">New features and changes will appear here automatically.</p>
                </div>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleGenerateFromCode}
              disabled={generatingAI}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {generatingAI ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Generate Documentation
                </>
              )}
            </button>
            <p className="text-xs text-gray-500">
              AI analyzes code structure, comments, and component props to generate documentation
            </p>
          </div>

          {/* Generation Log */}
          {aiGenerationLog.length > 0 && (
            <div className="mt-4 bg-gray-900 rounded-lg p-4 max-h-40 overflow-y-auto">
              {aiGenerationLog.map((log, index) => (
                <div key={index} className="flex items-start gap-2 text-sm font-mono">
                  <span className="text-gray-500 text-xs">
                    {log.time.toLocaleTimeString()}
                  </span>
                  <span className={
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-400' :
                    'text-blue-400'
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-gray-900">{articles.length}</span>
            <FileText className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-sm text-gray-500 mt-1">Total Articles</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-green-600">{articles.filter(a => a.published).length}</span>
            <Eye className="w-8 h-8 text-green-200" />
          </div>
          <p className="text-sm text-gray-500 mt-1">Published</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-purple-600">{articles.filter(a => a.aiGenerated).length}</span>
            <Sparkles className="w-8 h-8 text-purple-200" />
          </div>
          <p className="text-sm text-gray-500 mt-1">AI Generated</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-blue-600">
              {articles.reduce((sum, a) => sum + (a.views || 0), 0).toLocaleString()}
            </span>
            <ThumbsUp className="w-8 h-8 text-blue-200" />
          </div>
          <p className="text-sm text-gray-500 mt-1">Total Views</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Articles Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Article</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Category</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Stats</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredArticles.map((article) => (
              <tr key={article.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{article.title}</span>
                        {article.aiGenerated && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-600 text-xs rounded">
                            <Sparkles className="w-3 h-3" />
                            AI
                          </span>
                        )}
                        {article.featured && (
                          <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-600 text-xs rounded">
                            Featured
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate max-w-md">{article.summary}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                    {categories.find(c => c.id === article.category)?.name || article.category}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleTogglePublished(article)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
                      article.published
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {article.published ? (
                      <>
                        <Eye className="w-3 h-3" />
                        Published
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3" />
                        Draft
                      </>
                    )}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm">
                    <span className="text-gray-900">{article.views?.toLocaleString() || 0}</span>
                    <span className="text-gray-400"> views</span>
                    <span className="mx-1 text-gray-300">•</span>
                    <span className="text-green-600">{article.helpful || 0}%</span>
                    <span className="text-gray-400"> helpful</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditingArticle(article)}
                      className="p-2 text-gray-400 hover:text-panda-primary hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteArticle(article.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredArticles.length === 0 && (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-gray-900 font-medium mb-1">No articles found</h3>
            <p className="text-gray-500 text-sm">Try a different search or create a new article</p>
          </div>
        )}
        </div>
      </div>
    </AdminLayout>
  );
}

// Article Editor Component
function ArticleEditor({ article, categories, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    title: article?.title || '',
    category: article?.category || 'getting-started',
    summary: article?.summary || '',
    content: article?.content || '',
    published: article?.published ?? false,
    featured: article?.featured ?? false,
    aiGenerated: article?.aiGenerated ?? false,
    sourceFeature: article?.sourceFeature || '',
    ...article,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      id: article?.id,
      updatedAt: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={onCancel}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-2"
          >
            <ChevronRight className="w-5 h-5 rotate-180 mr-1" />
            Back to Articles
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {article ? 'Edit Article' : 'New Article'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Article
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Basic Information</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              placeholder="Article title"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Feature</label>
              <input
                type="text"
                value={formData.sourceFeature}
                onChange={(e) => setFormData({ ...formData, sourceFeature: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                placeholder="e.g., scheduling, leads, commissions"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
            <textarea
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              rows={2}
              placeholder="Brief description of the article"
              required
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.published}
                onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
              />
              <span className="text-sm text-gray-700">Published</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.featured}
                onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
              />
              <span className="text-sm text-gray-700">Featured</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.aiGenerated}
                onChange={(e) => setFormData({ ...formData, aiGenerated: e.target.checked })}
                className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
              />
              <span className="text-sm text-gray-700">AI Generated</span>
            </label>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Content (Markdown)</h2>
            <div className="text-xs text-gray-500">
              Supports # headings, **bold**, - lists, ```code blocks```
            </div>
          </div>
          <textarea
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary font-mono text-sm"
            rows={20}
            placeholder="# Article Title

## Section 1
Your content here...

### Subsection
- List item 1
- List item 2

## Section 2
More content..."
            required
          />
        </div>
      </form>
    </div>
  );
}
