import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { opportunitiesApi } from '../services/api';
import {
  Check,
  Clock,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Calendar,
  Target,
  FileText,
  Shield,
  Pen,
  Wrench,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';

/**
 * MilestoneTracker - Visual pipeline tracker showing job progress through stages
 *
 * Displays milestones with:
 * - Current stage indicator
 * - Date each milestone was reached
 * - Time spent in each stage
 * - Next step recommendation
 * - Ability to advance to next stage
 */

// Define the full stage progression order
const STAGE_ORDER = [
  'LEAD_UNASSIGNED',
  'LEAD_ASSIGNED',
  'SCHEDULED',
  'INSPECTED',
  'CLAIM_FILED',
  'ADJUSTER_MEETING_COMPLETE',
  'APPROVED',
  'CONTRACT_SIGNED',
  'IN_PRODUCTION',
  'COMPLETED',
  'CLOSED_WON',
];

// Define milestones with their stage mappings and icons
const MILESTONES = [
  {
    id: 'lead',
    label: 'Lead',
    stages: ['LEAD_UNASSIGNED', 'LEAD_ASSIGNED'],
    icon: Target,
    dateField: 'createdAt',
    color: 'blue',
  },
  {
    id: 'prospect',
    label: 'Prospect',
    stages: ['SCHEDULED', 'INSPECTED'],
    icon: Calendar,
    dateField: 'appointmentDate',
    color: 'indigo',
  },
  {
    id: 'approved',
    label: 'Approved',
    stages: ['CLAIM_FILED', 'ADJUSTER_MEETING_COMPLETE', 'APPROVED'],
    icon: Shield,
    dateField: 'claimFiledDate',
    color: 'purple',
  },
  {
    id: 'sold',
    label: 'Sold',
    stages: ['CONTRACT_SIGNED'],
    icon: Pen,
    dateField: 'soldDate',
    color: 'green',
  },
  {
    id: 'production',
    label: 'In Production',
    stages: ['IN_PRODUCTION'],
    icon: Wrench,
    dateField: null,
    color: 'yellow',
  },
  {
    id: 'completed',
    label: 'Completed',
    stages: ['COMPLETED', 'CLOSED_WON'],
    icon: CheckCircle,
    dateField: 'closeDate',
    color: 'emerald',
  },
];

// Map stages to their next recommended actions and next stage
const STAGE_CONFIG = {
  LEAD_UNASSIGNED: { nextStep: 'Assign to Sales Rep', nextStage: 'LEAD_ASSIGNED' },
  LEAD_ASSIGNED: { nextStep: 'Schedule Inspection', nextStage: 'SCHEDULED' },
  SCHEDULED: { nextStep: 'Complete Inspection', nextStage: 'INSPECTED' },
  INSPECTED: { nextStep: 'File Insurance Claim', nextStage: 'CLAIM_FILED' },
  CLAIM_FILED: { nextStep: 'Complete Adjuster Meeting', nextStage: 'ADJUSTER_MEETING_COMPLETE' },
  ADJUSTER_MEETING_COMPLETE: { nextStep: 'Prepare Specs & Get Approval', nextStage: 'APPROVED' },
  APPROVED: { nextStep: 'Send Contract', nextStage: 'CONTRACT_SIGNED' },
  CONTRACT_SIGNED: { nextStep: 'Start Production', nextStage: 'IN_PRODUCTION' },
  IN_PRODUCTION: { nextStep: 'Complete Installation', nextStage: 'COMPLETED' },
  COMPLETED: { nextStep: 'Close Job', nextStage: 'CLOSED_WON' },
  CLOSED_WON: { nextStep: 'Job Complete', nextStage: null },
  CLOSED_LOST: { nextStep: 'Review & Follow Up', nextStage: null },
};

// Calculate time difference in human readable format
function getTimeDiff(fromDate, toDate = new Date()) {
  if (!fromDate) return null;

  const from = new Date(fromDate);
  const to = new Date(toDate);
  const diffMs = to - from;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffDays > 30) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''}`;
  }
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  }
  return '<1 hour';
}

// Format date for display
function formatDate(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

export default function MilestoneTracker({ opportunity, onStageChange }) {
  const [showStageMenu, setShowStageMenu] = useState(false);
  const queryClient = useQueryClient();

  // Mutation to update opportunity stage
  const updateStageMutation = useMutation({
    mutationFn: async ({ opportunityId, stage }) => {
      return opportunitiesApi.updateOpportunity(opportunityId, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunity', opportunity.id]);
      queryClient.invalidateQueries(['opportunities']);
      setShowStageMenu(false);
      if (onStageChange) onStageChange();
    },
  });

  const { currentMilestoneIndex, milestoneData } = useMemo(() => {
    if (!opportunity?.stage) {
      return { currentMilestoneIndex: -1, milestoneData: [] };
    }

    // Find which milestone the current stage belongs to
    let currentIdx = -1;
    MILESTONES.forEach((milestone, idx) => {
      if (milestone.stages.includes(opportunity.stage)) {
        currentIdx = idx;
      }
    });

    // Build milestone data with dates and durations
    const data = MILESTONES.map((milestone, idx) => {
      const isComplete = idx < currentIdx;
      const isCurrent = idx === currentIdx;
      const isPending = idx > currentIdx;

      // Get date for this milestone
      let date = null;
      if (milestone.dateField && opportunity[milestone.dateField]) {
        date = opportunity[milestone.dateField];
      }

      // Calculate time in this milestone (if current or complete)
      let duration = null;
      if (isCurrent && date) {
        duration = getTimeDiff(date);
      }

      return {
        ...milestone,
        isComplete,
        isCurrent,
        isPending,
        date,
        formattedDate: formatDate(date),
        duration,
      };
    });

    return { currentMilestoneIndex: currentIdx, milestoneData: data };
  }, [opportunity]);

  if (!opportunity) return null;

  const currentMilestone = milestoneData[currentMilestoneIndex];
  const stageConfig = STAGE_CONFIG[opportunity.stage] || { nextStep: 'Continue Process', nextStage: null };
  const isLost = opportunity.stage === 'CLOSED_LOST';
  const isComplete = opportunity.stage === 'CLOSED_WON' || opportunity.stage === 'COMPLETED';

  // Get time in current stage
  const timeInStage = useMemo(() => {
    const lastStageChange = currentMilestone?.date || opportunity.updatedAt;
    return getTimeDiff(lastStageChange);
  }, [currentMilestone, opportunity.updatedAt]);

  // Handle advancing to next stage
  const handleAdvanceJob = () => {
    if (stageConfig.nextStage) {
      updateStageMutation.mutate({
        opportunityId: opportunity.id,
        stage: stageConfig.nextStage,
      });
    }
  };

  // Handle setting a specific stage
  const handleSetStage = (stage) => {
    updateStageMutation.mutate({
      opportunityId: opportunity.id,
      stage,
    });
  };

  // Get current stage index for the dropdown
  const currentStageIndex = STAGE_ORDER.indexOf(opportunity.stage);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header with current status summary */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-gray-500">Milestones</span>
            <span className="text-xs text-gray-400">|</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">In</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                isLost ? 'bg-red-100 text-red-700' :
                isComplete ? 'bg-green-100 text-green-700' :
                'bg-panda-primary/10 text-panda-primary'
              }`}>
                {currentMilestone?.label || opportunity.stage?.replace(/_/g, ' ')}
              </span>
              <span className="text-sm text-gray-600">Milestone</span>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-sm">
            {timeInStage && (
              <div className="flex items-center text-gray-500">
                <Clock className="w-3.5 h-3.5 mr-1" />
                <span>{timeInStage}</span>
              </div>
            )}
            <div className="flex items-center">
              <span className="text-gray-500 mr-2">Next:</span>
              <span className="font-medium text-gray-900">{stageConfig.nextStep}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Milestone Timeline */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between">
          {milestoneData.map((milestone, idx) => {
            const Icon = milestone.icon;
            const isLast = idx === milestoneData.length - 1;

            return (
              <div key={milestone.id} className="flex-1 relative">
                {/* Connector Line */}
                {!isLast && (
                  <div className={`absolute top-5 left-1/2 w-full h-0.5 ${
                    milestone.isComplete ? 'bg-green-400' : 'bg-gray-200'
                  }`} />
                )}

                {/* Milestone Node */}
                <div className="relative flex flex-col items-center">
                  {/* Icon Circle */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all ${
                    milestone.isComplete
                      ? 'bg-green-500 text-white shadow-sm'
                      : milestone.isCurrent
                      ? isLost
                        ? 'bg-red-500 text-white shadow-lg ring-4 ring-red-100'
                        : 'bg-panda-primary text-white shadow-lg ring-4 ring-panda-primary/20'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    {milestone.isComplete ? (
                      <Check className="w-5 h-5" />
                    ) : isLost && milestone.isCurrent ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>

                  {/* Label */}
                  <span className={`mt-2 text-xs font-medium text-center ${
                    milestone.isCurrent ? 'text-gray-900' : milestone.isComplete ? 'text-gray-700' : 'text-gray-400'
                  }`}>
                    {milestone.label}
                  </span>

                  {/* Date */}
                  <span className={`text-xs ${
                    milestone.formattedDate ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    {milestone.formattedDate || '- -'}
                  </span>

                  {/* Duration indicator for current milestone */}
                  {milestone.isCurrent && milestone.duration && (
                    <span className="mt-1 text-xs text-panda-primary font-medium">
                      {milestone.duration}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Details Bar */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-4">
            {/* Stage Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowStageMenu(!showStageMenu)}
                className="flex items-center text-gray-700 hover:text-gray-900"
              >
                <span className="font-medium mr-1">Status:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  isLost ? 'bg-red-100 text-red-700' :
                  isComplete ? 'bg-green-100 text-green-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {opportunity.stage?.replace(/_/g, ' ')}
                </span>
                <ChevronDown className="w-3.5 h-3.5 ml-1 text-gray-400" />
              </button>

              {/* Stage Selection Dropdown */}
              {showStageMenu && (
                <div className="absolute left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  {STAGE_ORDER.map((stage, idx) => (
                    <button
                      key={stage}
                      onClick={() => handleSetStage(stage)}
                      disabled={updateStageMutation.isPending}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center justify-between ${
                        opportunity.stage === stage ? 'bg-panda-primary/5 text-panda-primary font-medium' : 'text-gray-700'
                      }`}
                    >
                      <span>{stage.replace(/_/g, ' ')}</span>
                      {opportunity.stage === stage && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button
                      onClick={() => handleSetStage('CLOSED_LOST')}
                      disabled={updateStageMutation.isPending}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 ${
                        opportunity.stage === 'CLOSED_LOST' ? 'bg-red-50 font-medium' : ''
                      }`}
                    >
                      CLOSED LOST
                    </button>
                  </div>
                </div>
              )}
            </div>

            {opportunity.createdAt && (
              <div className="flex items-center text-gray-500">
                <Calendar className="w-3 h-3 mr-1" />
                <span>Created: {formatDate(opportunity.createdAt)}</span>
              </div>
            )}
          </div>

          {/* Advance Job Button */}
          {!isLost && !isComplete && stageConfig.nextStage && (
            <button
              onClick={handleAdvanceJob}
              disabled={updateStageMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-panda-primary hover:bg-panda-secondary rounded transition-colors disabled:opacity-50"
            >
              {updateStageMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  Advance to {stageConfig.nextStage.replace(/_/g, ' ')}
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {showStageMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowStageMenu(false)}
        />
      )}
    </div>
  );
}
