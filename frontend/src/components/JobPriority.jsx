import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { opportunitiesApi } from '../services/api';
import {
  Flag,
  ChevronDown,
  Check,
  AlertTriangle,
  Clock,
  Flame,
  Loader2,
  Info,
} from 'lucide-react';

/**
 * JobPriority - Priority badge with manual override and auto-escalation logic
 *
 * Auto-escalation rules based on calendar dates:
 * - CRITICAL: Appointment today, Install date passed, or Close date passed
 * - HIGH: Appointment within 2 days, Install within 3 days, Close date within 7 days
 * - NORMAL: Regular active jobs
 * - LOW: Jobs with no scheduled dates or far-future dates
 */

const PRIORITY_LEVELS = [
  { value: 'CRITICAL', label: 'Critical', icon: Flame, color: 'bg-red-500 text-white', badgeColor: 'bg-red-100 text-red-800 ring-red-500' },
  { value: 'HIGH', label: 'High', icon: AlertTriangle, color: 'bg-orange-500 text-white', badgeColor: 'bg-orange-100 text-orange-800 ring-orange-500' },
  { value: 'NORMAL', label: 'Normal', icon: Flag, color: 'bg-yellow-500 text-white', badgeColor: 'bg-yellow-100 text-yellow-800 ring-yellow-500' },
  { value: 'LOW', label: 'Low', icon: Clock, color: 'bg-gray-400 text-white', badgeColor: 'bg-gray-100 text-gray-700 ring-gray-400' },
];

// Calculate priority based on dates
function calculateAutoPriority(opportunity) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const reasons = [];
  let calculatedPriority = 'NORMAL';

  // Get relevant dates
  const appointmentDate = opportunity.appointmentDate ? new Date(opportunity.appointmentDate) : null;
  const closeDate = opportunity.closeDate ? new Date(opportunity.closeDate) : null;
  const installDate = opportunity.installDate ? new Date(opportunity.installDate) : null;
  const soldDate = opportunity.soldDate ? new Date(opportunity.soldDate) : null;

  // Check for CRITICAL conditions
  if (appointmentDate) {
    appointmentDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((appointmentDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntil === 0) {
      calculatedPriority = 'CRITICAL';
      reasons.push('Appointment today');
    } else if (daysUntil < 0) {
      calculatedPriority = 'CRITICAL';
      reasons.push(`Appointment ${Math.abs(daysUntil)} day${Math.abs(daysUntil) > 1 ? 's' : ''} overdue`);
    } else if (daysUntil <= 2) {
      if (calculatedPriority !== 'CRITICAL') {
        calculatedPriority = 'HIGH';
        reasons.push(`Appointment in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`);
      }
    }
  }

  if (installDate) {
    installDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((installDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntil === 0) {
      calculatedPriority = 'CRITICAL';
      reasons.push('Install today');
    } else if (daysUntil < 0) {
      calculatedPriority = 'CRITICAL';
      reasons.push(`Install ${Math.abs(daysUntil)} day${Math.abs(daysUntil) > 1 ? 's' : ''} overdue`);
    } else if (daysUntil <= 3) {
      if (calculatedPriority !== 'CRITICAL') {
        calculatedPriority = 'HIGH';
        reasons.push(`Install in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`);
      }
    }
  }

  if (closeDate) {
    closeDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((closeDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      calculatedPriority = 'CRITICAL';
      reasons.push(`Close date ${Math.abs(daysUntil)} day${Math.abs(daysUntil) > 1 ? 's' : ''} overdue`);
    } else if (daysUntil <= 7) {
      if (calculatedPriority !== 'CRITICAL') {
        calculatedPriority = calculatedPriority === 'NORMAL' ? 'HIGH' : calculatedPriority;
        reasons.push(`Close date in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`);
      }
    }
  }

  // Check for stale leads (no activity, no dates set)
  if (!appointmentDate && !installDate && !closeDate && !soldDate) {
    const createdAt = opportunity.createdAt ? new Date(opportunity.createdAt) : null;
    if (createdAt) {
      const daysOld = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      if (daysOld > 14) {
        calculatedPriority = 'HIGH';
        reasons.push(`Lead aging: ${daysOld} days old`);
      } else if (daysOld > 30) {
        calculatedPriority = 'CRITICAL';
        reasons.push(`Stale lead: ${daysOld} days old`);
      }
    }
  }

  // Jobs with no upcoming dates are LOW priority
  if (reasons.length === 0) {
    const isClosedWon = opportunity.stage === 'CLOSED_WON';
    const isClosedLost = opportunity.stage === 'CLOSED_LOST';
    const isCompleted = opportunity.stage === 'COMPLETED';

    if (isClosedWon || isClosedLost || isCompleted) {
      calculatedPriority = 'LOW';
      reasons.push('Job complete');
    }
  }

  return { priority: calculatedPriority, reasons };
}

export default function JobPriority({ opportunity, compact = false, onPriorityChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showAutoInfo, setShowAutoInfo] = useState(false);
  const queryClient = useQueryClient();

  // Calculate auto priority
  const autoPriority = useMemo(() => {
    return calculateAutoPriority(opportunity);
  }, [opportunity]);

  // Determine effective priority (manual override or auto)
  const effectivePriority = useMemo(() => {
    const manualPriority = opportunity.priority;
    const autoEscalate = opportunity.priorityAutoEscalate !== false;

    // If auto-escalate is on and auto is higher priority than manual, use auto
    const priorityOrder = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 };

    if (autoEscalate && priorityOrder[autoPriority.priority] > priorityOrder[manualPriority || 'NORMAL']) {
      return {
        value: autoPriority.priority,
        isAuto: true,
        reasons: autoPriority.reasons,
        manual: manualPriority,
      };
    }

    return {
      value: manualPriority || 'NORMAL',
      isAuto: false,
      reasons: opportunity.priorityReason ? [opportunity.priorityReason] : [],
      manual: manualPriority,
    };
  }, [opportunity, autoPriority]);

  const priorityConfig = PRIORITY_LEVELS.find(p => p.value === effectivePriority.value) || PRIORITY_LEVELS[2];
  const Icon = priorityConfig.icon;

  // Mutation to update priority
  const updatePriorityMutation = useMutation({
    mutationFn: async ({ priority, reason, autoEscalate }) => {
      return opportunitiesApi.updateOpportunity(opportunity.id, {
        priority,
        priorityReason: reason,
        prioritySetAt: new Date().toISOString(),
        priorityAutoEscalate: autoEscalate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunity', opportunity.id]);
      queryClient.invalidateQueries(['opportunities']);
      setShowMenu(false);
      if (onPriorityChange) onPriorityChange();
    },
  });

  const handleSetPriority = (level) => {
    updatePriorityMutation.mutate({
      priority: level.value,
      reason: 'Manually set',
      autoEscalate: false, // Disable auto-escalate when manually setting
    });
  };

  const handleResetToAuto = () => {
    updatePriorityMutation.mutate({
      priority: 'NORMAL',
      reason: null,
      autoEscalate: true,
    });
  };

  if (compact) {
    // Compact view for list pages
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityConfig.badgeColor} ${effectivePriority.isAuto ? 'ring-1 ring-inset' : ''}`}>
        <Icon className="w-3 h-3 mr-1" />
        {priorityConfig.label}
        {effectivePriority.isAuto && <span className="ml-1 text-[10px] opacity-70">AUTO</span>}
      </span>
    );
  }

  return (
    <div className="relative">
      {/* Priority Badge - Clickable */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:ring-2 hover:ring-offset-1 ${priorityConfig.badgeColor} ${effectivePriority.isAuto ? 'ring-1 ring-inset' : ''}`}
      >
        <Icon className="w-4 h-4 mr-1.5" />
        <span>{priorityConfig.label}</span>
        {effectivePriority.isAuto && (
          <span className="ml-1.5 text-xs opacity-70">(Auto)</span>
        )}
        <ChevronDown className="w-4 h-4 ml-1.5 opacity-60" />
      </button>

      {/* Priority Reason Tooltip */}
      {effectivePriority.reasons.length > 0 && (
        <div className="mt-1 text-xs text-gray-500 flex items-center">
          <Info className="w-3 h-3 mr-1" />
          {effectivePriority.reasons.join(', ')}
        </div>
      )}

      {/* Dropdown Menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Set Priority</div>
            </div>

            {PRIORITY_LEVELS.map((level) => {
              const LevelIcon = level.icon;
              const isActive = effectivePriority.value === level.value && !effectivePriority.isAuto;

              return (
                <button
                  key={level.value}
                  onClick={() => handleSetPriority(level)}
                  disabled={updatePriorityMutation.isPending}
                  className={`w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-gray-50 ${
                    isActive ? 'bg-gray-50' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${level.color}`}>
                      <LevelIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{level.label}</div>
                      <div className="text-xs text-gray-500">
                        {level.value === 'CRITICAL' && 'Immediate attention required'}
                        {level.value === 'HIGH' && 'Address soon'}
                        {level.value === 'NORMAL' && 'Standard priority'}
                        {level.value === 'LOW' && 'When time permits'}
                      </div>
                    </div>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-panda-primary" />}
                </button>
              );
            })}

            {/* Auto-Escalate Option */}
            <div className="border-t border-gray-100 mt-2 pt-2">
              <button
                onClick={handleResetToAuto}
                disabled={updatePriorityMutation.isPending}
                className={`w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-gray-50 ${
                  effectivePriority.isAuto ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500 text-white">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Auto-Escalate</div>
                    <div className="text-xs text-gray-500">
                      Based on calendar dates
                    </div>
                  </div>
                </div>
                {effectivePriority.isAuto && <Check className="w-4 h-4 text-blue-600" />}
              </button>

              {/* Show auto-calculated priority info */}
              {!effectivePriority.isAuto && autoPriority.reasons.length > 0 && (
                <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 mx-2 rounded mt-1">
                  <div className="font-medium">Auto would set: {autoPriority.priority}</div>
                  <div>{autoPriority.reasons.join(', ')}</div>
                </div>
              )}
            </div>

            {updatePriorityMutation.isPending && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-panda-primary" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Compact badge for list views
export function PriorityBadge({ priority, isAuto = false }) {
  const priorityConfig = PRIORITY_LEVELS.find(p => p.value === priority) || PRIORITY_LEVELS[2];
  const Icon = priorityConfig.icon;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityConfig.badgeColor} ${isAuto ? 'ring-1 ring-inset' : ''}`}>
      <Icon className="w-3 h-3 mr-1" />
      {priorityConfig.label}
    </span>
  );
}
