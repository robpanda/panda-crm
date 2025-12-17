import { BarChart3, TrendingUp, DollarSign, Users, Target, FileText, Download, Calendar } from 'lucide-react';

export default function Reports() {
  const reports = [
    {
      id: 'pipeline',
      name: 'Pipeline Report',
      description: 'Overview of opportunities by stage',
      icon: Target,
      category: 'Sales',
    },
    {
      id: 'revenue',
      name: 'Revenue Report',
      description: 'Monthly and YTD revenue breakdown',
      icon: DollarSign,
      category: 'Financial',
    },
    {
      id: 'performance',
      name: 'Sales Performance',
      description: 'Individual and team performance metrics',
      icon: TrendingUp,
      category: 'Sales',
    },
    {
      id: 'leads',
      name: 'Lead Conversion',
      description: 'Lead to opportunity conversion rates',
      icon: Users,
      category: 'Marketing',
    },
    {
      id: 'activity',
      name: 'Activity Report',
      description: 'Calls, meetings, and tasks completed',
      icon: Calendar,
      category: 'Activity',
    },
    {
      id: 'commissions',
      name: 'Commission Report',
      description: 'Sales commission calculations',
      icon: DollarSign,
      category: 'Financial',
    },
  ];

  const categories = [...new Set(reports.map((r) => r.category))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500">View and export business reports</p>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <FileText className="w-4 h-4" />
          <span>Create Custom Report</span>
        </button>
      </div>

      {categories.map((category) => (
        <div key={category}>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{category}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports
              .filter((r) => r.category === category)
              .map((report) => {
                const Icon = report.icon;
                return (
                  <div
                    key={report.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="font-medium text-gray-900 mt-4">{report.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
