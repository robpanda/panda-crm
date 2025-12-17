import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Target, Users, FileText, Phone, Clock, CheckCircle } from 'lucide-react';

export default function AttentionQueue() {
  const [filter, setFilter] = useState('all');

  // Mock data - will be replaced with API call
  const items = [
    {
      id: 1,
      title: 'Follow up with John Smith',
      description: 'Customer requested callback about roof inspection',
      type: 'opportunity',
      urgency: 'high',
      relatedId: '123',
      relatedType: 'Opportunity',
      createdAt: '2 hours ago',
    },
    {
      id: 2,
      title: 'Schedule inspection for 123 Main St',
      description: 'Inspection needs to be scheduled within 48 hours',
      type: 'workOrder',
      urgency: 'medium',
      relatedId: '456',
      relatedType: 'Work Order',
      createdAt: '5 hours ago',
    },
    {
      id: 3,
      title: 'Send quote to Mary Johnson',
      description: 'Quote has been prepared and needs to be sent',
      type: 'quote',
      urgency: 'low',
      relatedId: '789',
      relatedType: 'Quote',
      createdAt: 'Yesterday',
    },
  ];

  const filteredItems = filter === 'all' ? items : items.filter((i) => i.urgency === filter);

  const getIcon = (type) => {
    switch (type) {
      case 'opportunity':
        return Target;
      case 'contact':
        return Users;
      case 'quote':
        return FileText;
      default:
        return AlertCircle;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attention Queue</h1>
          <p className="text-gray-500">Items requiring your attention</p>
        </div>
      </div>

      {/* Urgency filters */}
      <div className="flex space-x-2">
        {[
          { value: 'all', label: 'All', count: items.length },
          { value: 'high', label: 'High Priority', count: items.filter((i) => i.urgency === 'high').length, color: 'red' },
          { value: 'medium', label: 'Medium', count: items.filter((i) => i.urgency === 'medium').length, color: 'yellow' },
          { value: 'low', label: 'Low', count: items.filter((i) => i.urgency === 'low').length, color: 'green' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
              filter === f.value
                ? f.color === 'red'
                  ? 'bg-red-500 text-white'
                  : f.color === 'yellow'
                  ? 'bg-yellow-500 text-white'
                  : f.color === 'green'
                  ? 'bg-green-500 text-white'
                  : 'bg-panda-primary text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{f.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              filter === f.value ? 'bg-white/20' : 'bg-gray-100'
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
            <p className="text-gray-500 mt-1">No items require your attention</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const Icon = getIcon(item.type);
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start space-x-4">
                  <div className={`w-3 h-3 mt-1.5 rounded-full flex-shrink-0 ${
                    item.urgency === 'high'
                      ? 'bg-red-500'
                      : item.urgency === 'medium'
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500">{item.relatedType}</span>
                    </div>
                    <h3 className="font-medium text-gray-900 mt-1">{item.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className="flex items-center text-xs text-gray-400">
                        <Clock className="w-3 h-3 mr-1" />
                        {item.createdAt}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                      Dismiss
                    </button>
                    <button className="px-3 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:opacity-90">
                      Take Action
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
