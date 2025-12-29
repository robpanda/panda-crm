import { useState } from 'react';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Search,
  Filter,
  FolderOpen,
  File,
  FileImage,
  FileSpreadsheet,
  Eye,
  MoreVertical,
  Plus,
  Grid,
  List,
  Clock,
  User,
} from 'lucide-react';

// Mock data for documents
const mockDocuments = [
  {
    id: 1,
    name: 'Contract_JohnSmith_2024.pdf',
    type: 'contract',
    size: '2.4 MB',
    uploadedBy: 'Mike Johnson',
    uploadedAt: '2024-12-15',
    accountName: 'John Smith',
    fileType: 'pdf',
  },
  {
    id: 2,
    name: 'Roof_Inspection_Photos.zip',
    type: 'photos',
    size: '15.8 MB',
    uploadedBy: 'Sarah Chen',
    uploadedAt: '2024-12-14',
    accountName: 'Sarah Williams',
    fileType: 'zip',
  },
  {
    id: 3,
    name: 'Invoice_12345.pdf',
    type: 'invoice',
    size: '156 KB',
    uploadedBy: 'System',
    uploadedAt: '2024-12-13',
    accountName: 'Robert Davis',
    fileType: 'pdf',
  },
  {
    id: 4,
    name: 'Insurance_Claim_Form.pdf',
    type: 'insurance',
    size: '1.2 MB',
    uploadedBy: 'Amanda Lee',
    uploadedAt: '2024-12-12',
    accountName: 'Michael Brown',
    fileType: 'pdf',
  },
  {
    id: 5,
    name: 'Material_Quote.xlsx',
    type: 'quote',
    size: '89 KB',
    uploadedBy: 'Mike Johnson',
    uploadedAt: '2024-12-11',
    accountName: 'Emily Johnson',
    fileType: 'xlsx',
  },
  {
    id: 6,
    name: 'Before_After_Gallery.zip',
    type: 'photos',
    size: '45.2 MB',
    uploadedBy: 'Crew A',
    uploadedAt: '2024-12-10',
    accountName: 'David Wilson',
    fileType: 'zip',
  },
];

const documentTypes = [
  { value: 'all', label: 'All Documents' },
  { value: 'contract', label: 'Contracts' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'quote', label: 'Quotes' },
  { value: 'photos', label: 'Photos' },
  { value: 'insurance', label: 'Insurance' },
];

const typeIcons = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  zip: FolderOpen,
  jpg: FileImage,
  png: FileImage,
  default: File,
};

const typeColors = {
  contract: 'bg-blue-100 text-blue-700',
  invoice: 'bg-green-100 text-green-700',
  quote: 'bg-purple-100 text-purple-700',
  photos: 'bg-yellow-100 text-yellow-700',
  insurance: 'bg-orange-100 text-orange-700',
};

export default function Documents() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [documents] = useState(mockDocuments);

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.accountName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'all' || doc.type === selectedType;
    return matchesSearch && matchesType;
  });

  const getFileIcon = (fileType) => {
    const Icon = typeIcons[fileType] || typeIcons.default;
    return Icon;
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-600 mt-1">Manage contracts, invoices, photos, and other files</p>
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
              <p className="text-2xl font-bold text-gray-900 mt-1">{documents.length}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Contracts</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {documents.filter(d => d.type === 'contract').length}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <File className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Photos</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {documents.filter(d => d.type === 'photos').length}
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
              <p className="text-2xl font-bold text-gray-900 mt-1">64.8 MB</p>
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
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              />
            </div>

            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
            >
              {documentTypes.map((type) => (
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

      {/* Documents List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Type
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Account
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Size
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Uploaded
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDocuments.map((doc) => {
                const FileIcon = getFileIcon(doc.fileType);
                return (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          <FileIcon className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 truncate max-w-xs">
                            {doc.name}
                          </div>
                          <div className="text-sm text-gray-500 md:hidden">
                            {doc.size} • {doc.type}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${typeColors[doc.type]}`}>
                        {doc.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 hidden lg:table-cell">
                      {doc.accountName}
                    </td>
                    <td className="px-6 py-4 text-gray-600 hidden sm:table-cell">
                      {doc.size}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <div className="text-sm text-gray-600">{formatDate(doc.uploadedAt)}</div>
                      <div className="text-xs text-gray-400">{doc.uploadedBy}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Preview">
                          <Eye className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Download">
                          <Download className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredDocuments.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p>No documents found</p>
            </div>
          )}
        </div>
      )}

      {/* Documents Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocuments.map((doc) => {
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
                <h4 className="font-medium text-gray-900 truncate" title={doc.name}>
                  {doc.name}
                </h4>
                <p className="text-sm text-gray-500 mt-1">{doc.accountName}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <span className={`text-xs px-2 py-1 rounded-full ${typeColors[doc.type]}`}>
                    {doc.type}
                  </span>
                  <span className="text-xs text-gray-400">{doc.size}</span>
                </div>
                <div className="flex items-center mt-2 text-xs text-gray-400">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatDate(doc.uploadedAt)}
                </div>
              </div>
            );
          })}

          {filteredDocuments.length === 0 && (
            <div className="col-span-full p-8 text-center text-gray-500 bg-white rounded-xl border border-gray-200">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p>No documents found</p>
            </div>
          )}
        </div>
      )}

      {/* Upload Drop Zone */}
      <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center hover:border-panda-primary transition-colors cursor-pointer">
        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <p className="text-gray-600 font-medium">Drag and drop files here</p>
        <p className="text-sm text-gray-400 mt-1">or click to browse</p>
        <p className="text-xs text-gray-400 mt-3">Supported: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, ZIP</p>
      </div>
    </div>
  );
}
