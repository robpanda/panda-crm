import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileText,
  Upload,
  Download,
  Search,
  FolderOpen,
  File,
  FileImage,
  FileSpreadsheet,
  Eye,
  MoreVertical,
  Grid,
  List,
  Clock,
  Building2,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ExternalLink,
  Pencil,
  Tag,
  Trash2,
} from 'lucide-react';
import { documentsApi } from '../services/api';

const documentTypes = [
  { value: 'all', label: 'All Documents' },
  { value: 'contract', label: 'Contracts' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'quote', label: 'Quotes' },
  { value: 'photos', label: 'Photos' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'payment', label: 'Payments' },
  { value: 'permit', label: 'Permits/HOA' },
  { value: 'measurement', label: 'Measurements' },
  { value: 'other', label: 'Other' },
];

const fileTypes = [
  { value: 'all', label: 'All Types' },
  { value: 'PDF', label: 'PDF' },
  { value: 'XLSX', label: 'Excel' },
  { value: 'JPG', label: 'Images' },
  { value: 'PNG', label: 'PNG' },
  { value: 'ZIP', label: 'ZIP' },
];

const typeIcons = {
  PDF: FileText,
  XLSX: FileSpreadsheet,
  XLS: FileSpreadsheet,
  ZIP: FolderOpen,
  JPG: FileImage,
  JPEG: FileImage,
  PNG: FileImage,
  GIF: FileImage,
  default: File,
};

const categoryColors = {
  contract: 'bg-blue-100 text-blue-700',
  invoice: 'bg-green-100 text-green-700',
  quote: 'bg-purple-100 text-purple-700',
  photos: 'bg-yellow-100 text-yellow-700',
  insurance: 'bg-orange-100 text-orange-700',
  payment: 'bg-emerald-100 text-emerald-700',
  permit: 'bg-pink-100 text-pink-700',
  measurement: 'bg-cyan-100 text-cyan-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function Documents() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFileType, setSelectedFileType] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [selectedDocuments, setSelectedDocuments] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch documents from API
  const {
    data: documentsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['documents', page, limit, searchQuery, selectedCategory, selectedFileType],
    queryFn: () =>
      documentsApi.getDocuments({
        page,
        limit,
        search: searchQuery || undefined,
        type: selectedCategory !== 'all' ? selectedCategory : undefined,
        fileType: selectedFileType !== 'all' ? selectedFileType : undefined,
      }),
  });

  // Fetch repository stats
  const { data: statsData } = useQuery({
    queryKey: ['documentStats'],
    queryFn: () => documentsApi.getRepositoryStats(),
  });

  const documents = documentsData?.data?.documents || [];
  const pagination = documentsData?.data?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 };
  const stats = statsData?.data || {};

  const getFileIcon = (fileType) => {
    const Icon = typeIcons[fileType?.toUpperCase()] || typeIcons.default;
    return Icon;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Debounce search
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedDocuments.size === documents.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(documents.map((d) => d.id)));
    }
  };

  const toggleSelectDocument = (docId) => {
    const newSelected = new Set(selectedDocuments);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocuments(newSelected);
  };

  const clearSelection = () => {
    setSelectedDocuments(new Set());
  };

  const handleBulkDelete = () => {
    // TODO: Implement bulk delete API call
    console.log('Deleting documents:', Array.from(selectedDocuments));
    setShowDeleteConfirm(false);
    clearSelection();
  };

  const handleBulkDownload = () => {
    // TODO: Implement bulk download
    console.log('Downloading documents:', Array.from(selectedDocuments));
  };

  const handleBulkTag = () => {
    // TODO: Implement bulk tagging
    console.log('Tagging documents:', Array.from(selectedDocuments));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Repository</h1>
          <p className="text-gray-600 mt-1">All documents from Salesforce with job linkage</p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
          <Upload className="w-5 h-5 mr-2" />
          Upload Document
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Documents</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats.totalDocuments?.toLocaleString() || '-'}
              </p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Linked to Jobs</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats.totalLinks?.toLocaleString() || '-'}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Top File Type</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats.byFileType?.[0]?.fileType || 'PDF'}
              </p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <FileImage className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Storage Used</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats.storageUsedFormatted || '-'}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-col sm:flex-row gap-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by document title..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
            >
              {documentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            {/* File Type Filter */}
            <select
              value={selectedFileType}
              onChange={(e) => {
                setSelectedFileType(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
            >
              {fileTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              <List className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              <Grid className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedDocuments.size > 0 && (
        <div className="bg-panda-primary/10 border border-panda-primary/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-panda-primary">
              {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={clearSelection}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDownload}
              className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download
            </button>
            <button
              onClick={handleBulkTag}
              className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Tag className="w-4 h-4 mr-1.5" />
              Tag
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-panda-primary animate-spin" />
          <span className="ml-3 text-gray-600">Loading documents...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-red-800">Error loading documents</h4>
            <p className="text-sm text-red-600 mt-1">{error.message}</p>
          </div>
        </div>
      )}

      {/* Documents List View */}
      {!isLoading && !error && viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={documents.length > 0 && selectedDocuments.size === documents.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary/20"
                  />
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Category
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Linked Records
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Size
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Created
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {documents.map((doc) => {
                const FileIcon = getFileIcon(doc.fileType);
                return (
                  <tr key={doc.id} className={`hover:bg-gray-50 transition-colors ${selectedDocuments.has(doc.id) ? 'bg-panda-primary/5' : ''}`}>
                    <td className="w-12 px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedDocuments.has(doc.id)}
                        onChange={() => toggleSelectDocument(doc.id)}
                        className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary/20"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileIcon className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate max-w-xs" title={doc.title}>
                            {doc.title}
                          </div>
                          <div className="text-xs text-gray-500">
                            {doc.fileType} • {formatBytes(doc.contentSize)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span
                        className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                          categoryColors[doc.category] || categoryColors.other
                        }`}
                      >
                        {doc.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <div className="space-y-1">
                        {/* Linked Opportunities (Jobs) */}
                        {doc.linkedOpportunities?.map((opp) => (
                          <Link
                            key={opp.id}
                            to={`/jobs/${opp.id}`}
                            className="flex items-center text-sm text-panda-primary hover:underline"
                          >
                            <Briefcase className="w-3.5 h-3.5 mr-1" />
                            {opp.jobId || opp.name}
                          </Link>
                        ))}
                        {/* Linked Accounts */}
                        {doc.linkedAccounts?.map((acc) => (
                          <Link
                            key={acc.id}
                            to={`/accounts/${acc.id}`}
                            className="flex items-center text-sm text-gray-600 hover:text-panda-primary"
                          >
                            <Building2 className="w-3.5 h-3.5 mr-1" />
                            {acc.name}
                          </Link>
                        ))}
                        {doc.linkCount === 0 && (
                          <span className="text-xs text-gray-400">No linked records</span>
                        )}
                        {doc.linkCount > (doc.linkedOpportunities?.length || 0) + (doc.linkedAccounts?.length || 0) && (
                          <span className="text-xs text-gray-400">
                            +{doc.linkCount - (doc.linkedOpportunities?.length || 0) - (doc.linkedAccounts?.length || 0)} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 hidden sm:table-cell">
                      {formatBytes(doc.contentSize)}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <div className="text-sm text-gray-600">{formatDate(doc.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Preview">
                          <Eye className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Download">
                          <Download className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Tag">
                          <Tag className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-red-50 rounded-lg transition-colors group" title="Delete">
                          <Trash2 className="w-4 h-4 text-gray-500 group-hover:text-red-500" />
                        </button>
                        {doc.salesforceId && (
                          <a
                            href={`https://ability-saas-2460.my.salesforce.com/${doc.salesforceId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Open in Salesforce"
                          >
                            <ExternalLink className="w-4 h-4 text-gray-500" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {documents.length === 0 && !isLoading && (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p>No documents found</p>
            </div>
          )}
        </div>
      )}

      {/* Documents Grid View */}
      {!isLoading && !error && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {documents.map((doc) => {
            const FileIcon = getFileIcon(doc.fileType);
            return (
              <div
                key={doc.id}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <FileIcon className="w-6 h-6 text-gray-600" />
                  </div>
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <MoreVertical className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <h4 className="font-medium text-gray-900 truncate" title={doc.title}>
                  {doc.title}
                </h4>

                {/* Linked Jobs */}
                {doc.linkedOpportunities?.length > 0 && (
                  <div className="mt-2">
                    {doc.linkedOpportunities.slice(0, 2).map((opp) => (
                      <Link
                        key={opp.id}
                        to={`/jobs/${opp.id}`}
                        className="flex items-center text-xs text-panda-primary hover:underline"
                      >
                        <Briefcase className="w-3 h-3 mr-1" />
                        {opp.jobId || opp.name}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Linked Accounts */}
                {doc.linkedAccounts?.length > 0 && !doc.linkedOpportunities?.length && (
                  <div className="mt-2">
                    {doc.linkedAccounts.slice(0, 2).map((acc) => (
                      <Link
                        key={acc.id}
                        to={`/accounts/${acc.id}`}
                        className="flex items-center text-xs text-gray-500 hover:text-panda-primary"
                      >
                        <Building2 className="w-3 h-3 mr-1" />
                        {acc.name}
                      </Link>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      categoryColors[doc.category] || categoryColors.other
                    }`}
                  >
                    {doc.category}
                  </span>
                  <span className="text-xs text-gray-400">{formatBytes(doc.contentSize)}</span>
                </div>
                <div className="flex items-center mt-2 text-xs text-gray-400">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatDate(doc.createdAt)}
                </div>
              </div>
            );
          })}

          {documents.length === 0 && !isLoading && (
            <div className="col-span-full p-8 text-center text-gray-500 bg-white rounded-xl border border-gray-200">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p>No documents found</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div className="text-sm text-gray-600">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total.toLocaleString()} documents
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-4 py-2 text-sm text-gray-600">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
              disabled={page === pagination.totalPages}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Upload Drop Zone */}
      <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center hover:border-panda-primary transition-colors cursor-pointer">
        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <p className="text-gray-600 font-medium">Drag and drop files here</p>
        <p className="text-sm text-gray-400 mt-1">or click to browse</p>
        <p className="text-xs text-gray-400 mt-3">Supported: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, ZIP</p>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Documents</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
