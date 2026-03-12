import { NavLink, useParams } from 'react-router-dom';
import { Activity, BarChart3, Sparkles } from 'lucide-react';
import AnalyticsHealth from './AnalyticsHealth';
import AnalyticsMetabase from './AnalyticsMetabase';
import AIInsightsFeed from '../AIInsightsFeed';

const SETTINGS_SECTIONS = [
  {
    id: 'health',
    label: 'Data Health',
    description: 'Monitor syncs, mappings, and reporting readiness.',
    icon: Activity,
  },
  {
    id: 'metabase',
    label: 'Metabase',
    description: 'Configure external dashboards inside Analytics.',
    icon: BarChart3,
  },
  {
    id: 'ai',
    label: 'AI Insights',
    description: 'Review AI-generated insights and recommendations.',
    icon: Sparkles,
  },
];

function renderSection(sectionId) {
  if (sectionId === 'metabase') {
    return <AnalyticsMetabase />;
  }

  if (sectionId === 'ai') {
    return <AIInsightsFeed embedded />;
  }

  return <AnalyticsHealth />;
}

export default function AnalyticsSettings() {
  const { section = 'health' } = useParams();
  const activeSection = SETTINGS_SECTIONS.find((item) => item.id === section) || SETTINGS_SECTIONS[0];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-600">Analytics Settings</p>
            <h2 className="mt-1 text-2xl font-semibold text-gray-900">{activeSection.label}</h2>
            <p className="mt-2 text-sm text-gray-500">{activeSection.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {SETTINGS_SECTIONS.map((item) => (
              <NavLink
                key={item.id}
                to={`/analytics/settings/${item.id}`}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      {renderSection(activeSection.id)}
    </div>
  );
}
