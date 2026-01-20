// Lead Rank Badge Component
// Displays lead score with visual ranking (A/B/C/D/F)
import React from 'react';
import { Flame, ThumbsUp, Zap, Snowflake, Pause, TrendingUp, TrendingDown, Info } from 'lucide-react';

// Rank configuration with colors and labels
const RANK_CONFIG = {
  A: {
    label: 'Hot Lead',
    color: 'bg-green-500',
    textColor: 'text-green-700',
    bgLight: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: Flame,
    description: 'High conversion probability',
  },
  B: {
    label: 'Warm Lead',
    color: 'bg-blue-500',
    textColor: 'text-blue-700',
    bgLight: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: ThumbsUp,
    description: 'Good conversion potential',
  },
  C: {
    label: 'Average',
    color: 'bg-yellow-500',
    textColor: 'text-yellow-700',
    bgLight: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: Zap,
    description: 'Standard priority',
  },
  D: {
    label: 'Cool Lead',
    color: 'bg-orange-500',
    textColor: 'text-orange-700',
    bgLight: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: Snowflake,
    description: 'Lower conversion likelihood',
  },
  F: {
    label: 'Low Priority',
    color: 'bg-gray-400',
    textColor: 'text-gray-600',
    bgLight: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: Pause,
    description: 'Minimal conversion signals',
  },
};

/**
 * LeadRankBadge - Compact badge showing lead rank
 */
export function LeadRankBadge({ rank, score, size = 'md', showLabel = false }) {
  const config = RANK_CONFIG[rank] || RANK_CONFIG.F;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold text-white ${config.color} ${sizeClasses[size]}`}
        title={`${config.label} - Score: ${score || 0}`}
      >
        <Icon className="w-3 h-3" />
        {rank}
      </span>
      {showLabel && (
        <span className={`text-xs ${config.textColor}`}>{config.label}</span>
      )}
    </div>
  );
}

/**
 * LeadScoreBar - Visual progress bar for lead score
 */
export function LeadScoreBar({ score, rank, showScore = true, className = '' }) {
  const config = RANK_CONFIG[rank] || RANK_CONFIG.F;
  const normalizedScore = Math.min(100, Math.max(0, score || 0));

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${config.color} transition-all duration-500`}
          style={{ width: `${normalizedScore}%` }}
        />
      </div>
      {showScore && (
        <span className={`text-xs font-medium ${config.textColor} w-8 text-right`}>
          {normalizedScore}
        </span>
      )}
    </div>
  );
}

/**
 * LeadScoreCard - Full card showing rank, score, and factors
 */
export function LeadScoreCard({ rank, score, factors = [], scoredAt, onRefresh, isLoading }) {
  const config = RANK_CONFIG[rank] || RANK_CONFIG.F;
  const Icon = config.icon;

  // Sort factors by impact
  const sortedFactors = [...factors].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const topFactors = sortedFactors.slice(0, 5);

  return (
    <div className={`rounded-lg border ${config.borderColor} ${config.bgLight} p-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${config.textColor}`}>{rank}</span>
              <span className="text-gray-500">•</span>
              <span className="text-lg font-semibold text-gray-700">{score}/100</span>
            </div>
            <p className="text-sm text-gray-600">{config.label}</p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh score"
          >
            <svg
              className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Score Bar */}
      <LeadScoreBar score={score} rank={rank} showScore={false} className="mb-4" />

      {/* Factors */}
      {topFactors.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Score Factors
          </p>
          {topFactors.map((factor, idx) => (
            <ScoreFactorRow key={idx} factor={factor} />
          ))}
        </div>
      )}

      {/* Footer */}
      {scoredAt && (
        <p className="mt-3 text-xs text-gray-400">
          Scored {new Date(scoredAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

/**
 * ScoreFactorRow - Single factor with impact indicator
 */
function ScoreFactorRow({ factor }) {
  const isPositive = factor.impact > 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const impactColor = isPositive ? 'text-green-600' : 'text-red-500';
  const bgColor = isPositive ? 'bg-green-50' : 'bg-red-50';

  return (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded ${bgColor}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${impactColor}`} />
        <span className="text-sm text-gray-700">{factor.name}</span>
      </div>
      <span className={`text-sm font-medium ${impactColor}`}>
        {isPositive ? '+' : ''}{factor.impact}
      </span>
    </div>
  );
}

/**
 * LeadScoreTooltip - Hover tooltip with score breakdown
 */
export function LeadScoreTooltip({ rank, score, factors = [], children }) {
  const config = RANK_CONFIG[rank] || RANK_CONFIG.F;

  return (
    <div className="group relative inline-block">
      {children}
      <div className="absolute z-50 hidden group-hover:block w-64 p-3 bg-white rounded-lg shadow-lg border border-gray-200 -translate-x-1/2 left-1/2 mt-2">
        <div className="flex items-center gap-2 mb-2">
          <LeadRankBadge rank={rank} score={score} size="sm" />
          <span className="text-sm font-medium">{config.label}</span>
          <span className="text-sm text-gray-500">({score}/100)</span>
        </div>
        <p className="text-xs text-gray-500 mb-2">{config.description}</p>
        {factors.length > 0 && (
          <div className="border-t pt-2 space-y-1">
            <p className="text-xs font-medium text-gray-400">Top Factors:</p>
            {factors.slice(0, 3).map((f, i) => (
              <div key={i} className="flex items-center gap-1 text-xs">
                <span className={f.impact > 0 ? 'text-green-600' : 'text-red-500'}>
                  {f.impact > 0 ? '↑' : '↓'}
                </span>
                <span className="text-gray-600 truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * LeadScoreDistribution - Chart showing score distribution across all leads
 */
export function LeadScoreDistribution({ distribution = {} }) {
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);

  if (total === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Info className="w-8 h-8 mx-auto mb-2" />
        <p>No scored leads yet</p>
      </div>
    );
  }

  const ranks = ['A', 'B', 'C', 'D', 'F'];

  return (
    <div className="space-y-3">
      {ranks.map(rank => {
        const config = RANK_CONFIG[rank];
        const count = distribution[rank] || 0;
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <div key={rank} className="flex items-center gap-3">
            <div className="w-8">
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${config.color}`}>
                {rank}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">{config.label}</span>
                <span className="font-medium">{count.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${config.color} transition-all duration-500`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
            <div className="w-12 text-right text-sm text-gray-500">
              {percent}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default LeadRankBadge;
