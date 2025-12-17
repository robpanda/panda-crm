import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { opportunitiesApi, leadsApi } from '../services/api';
import {
  Target,
  UserPlus,
  DollarSign,
  TrendingUp,
  Calendar,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stageCounts } = useQuery({
    queryKey: ['opportunityStageCounts', 'mine'],
    queryFn: () => opportunitiesApi.getStageCounts('mine'),
  });

  const { data: leadCounts } = useQuery({
    queryKey: ['leadCounts'],
    queryFn: () => leadsApi.getLeadCounts(),
  });

  const stats = [
    {
      label: 'Open Opportunities',
      value: stageCounts?.open || 0,
      icon: Target,
      color: 'from-blue-500 to-blue-600',
      link: '/opportunities?stage=open',
    },
    {
      label: 'New Leads',
      value: leadCounts?.new || 0,
      icon: UserPlus,
      color: 'from-green-500 to-green-600',
      link: '/leads?status=new',
    },
    {
      label: 'Pipeline Value',
      value: `$${((stageCounts?.pipelineValue || 0) / 1000).toFixed(0)}K`,
      icon: DollarSign,
      color: 'from-purple-500 to-purple-600',
      link: '/reports/pipeline',
    },
    {
      label: 'Win Rate',
      value: `${stageCounts?.winRate || 0}%`,
      icon: TrendingUp,
      color: 'from-orange-500 to-orange-600',
      link: '/reports/performance',
    },
  ];

  const pipelineStages = [
    { stage: 'Lead Unassigned', count: stageCounts?.leadUnassigned || 0, color: 'bg-gray-400' },
    { stage: 'Lead Assigned', count: stageCounts?.leadAssigned || 0, color: 'bg-blue-400' },
    { stage: 'Scheduled', count: stageCounts?.scheduled || 0, color: 'bg-indigo-400' },
    { stage: 'Inspected', count: stageCounts?.inspected || 0, color: 'bg-purple-400' },
    { stage: 'Claim Filed', count: stageCounts?.claimFiled || 0, color: 'bg-pink-400' },
    { stage: 'Approved', count: stageCounts?.approved || 0, color: 'bg-green-400' },
    { stage: 'Contract Signed', count: stageCounts?.contractSigned || 0, color: 'bg-emerald-400' },
    { stage: 'In Production', count: stageCounts?.inProduction || 0, color: 'bg-yellow-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-gray-500">Here's what's happening with your sales today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              to={stat.link}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Overview */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Pipeline Overview</h2>
              <Link to="/opportunities" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              {pipelineStages.map((item) => (
                <div key={item.stage} className="flex items-center">
                  <div className="w-32 text-sm text-gray-600">{item.stage}</div>
                  <div className="flex-1 mx-4">
                    <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all duration-500`}
                        style={{
                          width: `${Math.min(100, (item.count / 20) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-8 text-right font-semibold text-gray-900">{item.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Attention Queue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Attention Queue</h2>
              <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">
                3 items
              </span>
            </div>
          </div>
          <div className="p-2">
            {[
              { title: 'Follow up with John Smith', type: 'Opportunity', urgency: 'high' },
              { title: 'Schedule inspection for 123 Main St', type: 'Work Order', urgency: 'medium' },
              { title: 'Send quote to Mary Johnson', type: 'Quote', urgency: 'low' },
            ].map((item, index) => (
              <div
                key={index}
                className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
              >
                <div className={`w-2 h-2 mt-2 rounded-full ${
                  item.urgency === 'high' ? 'bg-red-500' :
                  item.urgency === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.type}</p>
                </div>
                <AlertCircle className={`w-4 h-4 ${
                  item.urgency === 'high' ? 'text-red-500' :
                  item.urgency === 'medium' ? 'text-yellow-500' : 'text-green-500'
                }`} />
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-100">
            <Link
              to="/attention"
              className="block text-center text-sm text-panda-primary hover:underline"
            >
              View All Items
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity & Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {[
              { action: 'Created opportunity', subject: 'Johnson Residence Roof', time: '2 hours ago', icon: Target },
              { action: 'Closed won', subject: 'Smith Family Siding Project', time: '5 hours ago', icon: CheckCircle },
              { action: 'Scheduled inspection', subject: '456 Oak Lane', time: 'Yesterday', icon: Calendar },
              { action: 'Added contact', subject: 'Mike Thompson', time: 'Yesterday', icon: UserPlus },
            ].map((activity, index) => {
              const Icon = activity.icon;
              return (
                <div key={index} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{activity.action}</span> {activity.subject}
                    </p>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Today's Schedule</h2>
              <Link to="/schedule" className="text-panda-primary text-sm hover:underline flex items-center">
                Full Calendar <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-2">
            {[
              { time: '9:00 AM', title: 'Inspection - 123 Main St', type: 'Inspection' },
              { time: '11:30 AM', title: 'Quote Review - Thompson Project', type: 'Meeting' },
              { time: '2:00 PM', title: 'Follow-up Call - Davis Family', type: 'Call' },
              { time: '4:00 PM', title: 'Site Visit - Commercial Plaza', type: 'Visit' },
            ].map((event, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                <div className="w-16 text-sm font-medium text-gray-500">{event.time}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{event.title}</p>
                  <p className="text-xs text-gray-500">{event.type}</p>
                </div>
                <Clock className="w-4 h-4 text-gray-400" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
