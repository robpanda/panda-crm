import { useEffect, useMemo, useReducer, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  ClipboardCheck,
  FileCheck,
  Info,
  Send,
  X,
} from 'lucide-react';
import { opportunitiesApi } from '../../services/api';
import {
  ACTIONS,
  computeQuoteTotal,
  deriveDisposition,
  initialState,
  wizardReducer,
} from './wizardReducer';
import {
  DEFAULT_FOLLOW_UP_DURATION_MINUTES,
  DISPOSITION_CATEGORIES,
  FOLLOW_UP_MODES,
  INSPECTION_NOT_COMPLETED_REASONS,
  NO_CLAIM_REASONS,
  NO_PITCH_RETAIL_REASONS,
  RETAIL_NOT_SOLD_REASONS,
  STEPS,
  STEP_TITLES,
  STORM_DAMAGE_BADGE,
  VIRTUAL_TASK_TYPES,
} from './wizardConstants';

const extractDatePart = (value) => {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
    if (dateMatch) return dateMatch[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateInputValue = (value) => extractDatePart(value);
const toTimeInputValue = (value, fallback = '09:00') => value || fallback;

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatDate = (value) => {
  if (!value) return '-';
  const datePart = extractDatePart(value);
  if (!datePart) return value;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toLocaleDateString('en-US');
};

export default function ResultAppointmentWizard({
  isOpen,
  onClose,
  opportunityId,
  appointmentId = null,
  opportunity,
  onCompleted,
}) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const [error, setError] = useState('');
  const [previewRequested, setPreviewRequested] = useState(false);

  const disposition = useMemo(() => deriveDisposition(state), [state]);
  const quoteTotal = useMemo(() => computeQuoteTotal(state), [state]);

  useEffect(() => {
    if (!isOpen) return;
    dispatch({ type: ACTIONS.RESET });
    setError('');
    setPreviewRequested(false);
  }, [isOpen]);

  const submitMutation = useMutation({
    mutationFn: (payload) => opportunitiesApi.submitAppointmentResult(opportunityId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['opportunity', opportunityId]);
      queryClient.invalidateQueries(['opportunitySummary', opportunityId]);
      queryClient.invalidateQueries(['opportunityAppointments', opportunityId]);
      queryClient.invalidateQueries(['opportunityTasks', opportunityId]);
      onCompleted?.(data);
      onClose();
    },
    onError: (err) => {
      setError(err?.response?.data?.error?.message || 'Failed to save appointment result');
    },
  });

  if (!isOpen) return null;

  const setField = (field, value) => dispatch({ type: ACTIONS.SET_FIELD, field, value });
  const goToStep = (step, extra = {}) => dispatch({ type: ACTIONS.GO_TO_STEP, step, extra });
  const goBack = () => dispatch({ type: ACTIONS.GO_BACK });

  const startFollowUp = (context) => {
    dispatch({ type: ACTIONS.START_FOLLOW_UP, context });
  };

  const canSubmit = () => {
    if (state.step !== STEPS.CONFIRM || !disposition.category) return false;

    if (
      disposition.category === DISPOSITION_CATEGORIES.INSPECTION_NOT_COMPLETED &&
      !state.noInspectionReason
    ) {
      return false;
    }

    if (
      disposition.category === DISPOSITION_CATEGORIES.INSURANCE_NO_CLAIM &&
      !state.noClaimReason
    ) {
      return false;
    }

    if (
      disposition.category === DISPOSITION_CATEGORIES.RETAIL_NOT_SOLD &&
      !state.retailNoSaleReason
    ) {
      return false;
    }

    if (
      disposition.category === DISPOSITION_CATEGORIES.INSURANCE_CLAIM_FILED &&
      !(state.insuranceCompany || state.claimNumber)
    ) {
      return false;
    }

    if (
      disposition.category === DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED ||
      disposition.category === DISPOSITION_CATEGORIES.RESCHEDULED
    ) {
      if (state.followUpMode === 'VIRTUAL') {
        return Boolean(state.virtualTaskType && state.virtualDueDate);
      }
      if (state.followUpMode === 'IN_PERSON') {
        return Boolean(state.inPersonDate && state.inPersonTime);
      }
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    setError('');
    if (!opportunityId) {
      setError('Missing job ID');
      return;
    }

    const payload = {
      sourceAppointmentId: appointmentId || null,
      appointmentId: appointmentId || null,
      dispositionCategory: disposition.category,
      dispositionReason: disposition.reason,
      followUpAt: disposition.followUpDate || null,
      followUpType: disposition.followUpType || null,
      followUpContext: state.followUpContext || null,
      insuranceCompany: state.insuranceCompany || null,
      claimNumber: state.claimNumber || null,
      claimFiledDate: state.claimFiledDate || null,
      dateOfLoss: state.dateOfLoss || null,
      damageLocation: state.damageLocation || null,
      notes: state.notes || null,
      autoStageUpdate: true,
      virtualTask:
        state.followUpMode === 'VIRTUAL'
          ? {
              taskType: state.virtualTaskType || 'CALL',
              dueDate: state.virtualDueDate || null,
              dueTime: state.virtualDueTime || null,
              notes: state.virtualNotes || null,
            }
          : null,
      inPersonAppointment:
        state.followUpMode === 'IN_PERSON'
          ? {
              date: state.inPersonDate || null,
              time: state.inPersonTime || null,
              durationMinutes: Number(
                state.inPersonDurationMinutes || DEFAULT_FOLLOW_UP_DURATION_MINUTES
              ),
              notes: state.inPersonNotes || null,
            }
          : null,
      answers: {
        roofInspected: state.roofInspected,
        stormDamage: state.stormDamage,
        insuranceOutcome: state.insuranceOutcome,
        noInspectionReason: state.noInspectionReason,
        noClaimReason: state.noClaimReason,
        pitchRetail: state.pitchRetail,
        noPitchRetailReason: state.noPitchRetailReason,
        retailOutcome: state.retailOutcome,
        retailNoSaleReason: state.retailNoSaleReason,
        followUpContext: state.followUpContext,
        followUpMode: state.followUpMode,
        saPrepared: state.saPrepared,
        saSent: state.saSent,
        quote: {
          roofSqFt: state.quoteRoofSqFt,
          materials: state.quoteMaterials,
          labor: state.quoteLabor,
          total: quoteTotal,
        },
      },
    };

    submitMutation.mutate(payload);
  };

  const footerActionLabel =
    state.step === STEPS.CONFIRM
      ? submitMutation.isPending
        ? 'Saving...'
        : 'Submit Result'
      : 'Continue';

  const renderHeader = () => (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {state.stepHistory.length > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Result Appointment</h2>
            <p className="text-sm text-gray-500">{STEP_TITLES[state.step]}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  const renderInspectionNotCompletedStep = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reason inspection did not occur
        </label>
        <select
          value={state.noInspectionReason}
          onChange={(event) =>
            dispatch({ type: ACTIONS.SET_NO_INSPECTION_REASON, value: event.target.value })
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
        >
          <option value="">Select a reason</option>
          {INSPECTION_NOT_COMPLETED_REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => startFollowUp('INSPECTION_NOT_COMPLETED')}
          disabled={!state.noInspectionReason}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
        >
          <CalendarDays className="w-4 h-4" />
          Reschedule / Second Visit
        </button>
        <button
          type="button"
          onClick={() => goToStep(STEPS.CONFIRM)}
          disabled={!state.noInspectionReason}
          className="w-full px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          Continue without follow-up
        </button>
      </div>
    </div>
  );

  const renderNoClaimReasonStep = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reason no claim was filed
        </label>
        <select
          value={state.noClaimReason}
          onChange={(event) => {
            const value = event.target.value;
            dispatch({ type: ACTIONS.SET_NO_CLAIM_REASON, value });
            dispatch({ type: ACTIONS.SET_FIELD, field: 'pitchRetail', value: null });
            dispatch({ type: ACTIONS.SET_FIELD, field: 'noPitchRetailReason', value: '' });
            if (value === 'FOLLOW_UP_SCHEDULED') {
              startFollowUp('INSURANCE_NO_CLAIM');
            }
          }}
          className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
        >
          <option value="">Select a reason</option>
          {NO_CLAIM_REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>

      {state.noClaimReason && state.noClaimReason !== 'FOLLOW_UP_SCHEDULED' && (
        <>
          <button
            type="button"
            onClick={() => startFollowUp('INSURANCE_NO_CLAIM')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
          >
            <CalendarDays className="w-4 h-4" />
            Schedule optional follow-up
          </button>

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Would you like to pitch retail?</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => dispatch({ type: ACTIONS.SELECT_PITCH_RETAIL, value: 'yes' })}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 hover:border-green-500 hover:bg-green-50 text-left"
              >
                Yes, Pitch Retail
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: ACTIONS.SELECT_PITCH_RETAIL, value: 'no' })}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 hover:border-gray-500 hover:bg-gray-50 text-left"
              >
                No
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderFollowUpModeStep = () => (
    <div className="space-y-3">
      {FOLLOW_UP_MODES.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => dispatch({ type: ACTIONS.SELECT_FOLLOW_UP_MODE, value: mode.value })}
          className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition"
        >
          <div className="font-medium text-gray-900">{mode.label}</div>
          <div className="text-sm text-gray-600 mt-1">{mode.description}</div>
        </button>
      ))}
    </div>
  );

  const renderVirtualFollowUpStep = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Task type</label>
        <select
          value={state.virtualTaskType}
          onChange={(event) => setField('virtualTaskType', event.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
        >
          {VIRTUAL_TASK_TYPES.map((taskType) => (
            <option key={taskType.value} value={taskType.value}>
              {taskType.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
          <input
            type="date"
            value={toDateInputValue(state.virtualDueDate)}
            onChange={(event) => setField('virtualDueDate', event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due time</label>
          <input
            type="time"
            value={toTimeInputValue(state.virtualDueTime)}
            onChange={(event) => setField('virtualDueTime', event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          rows={3}
          value={state.virtualNotes}
          onChange={(event) => setField('virtualNotes', event.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={() => goToStep(STEPS.CONFIRM)}
        disabled={!state.virtualDueDate}
        className="w-full px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
      >
        Save virtual follow-up
      </button>
    </div>
  );

  const renderInPersonFollowUpStep = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={toDateInputValue(state.inPersonDate)}
            onChange={(event) => setField('inPersonDate', event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
          <input
            type="time"
            value={toTimeInputValue(state.inPersonTime)}
            onChange={(event) => setField('inPersonTime', event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          rows={3}
          value={state.inPersonNotes}
          onChange={(event) => setField('inPersonNotes', event.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={() => goToStep(STEPS.CONFIRM)}
        disabled={!state.inPersonDate || !state.inPersonTime}
        className="w-full px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
      >
        Schedule in-person follow-up
      </button>
    </div>
  );

  const renderStepBody = () => {
    if (state.step === STEPS.ROOF_INSPECTED) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => dispatch({ type: ACTIONS.SELECT_ROOF_INSPECTED, value: 'yes' })}
              className="border border-gray-200 rounded-lg p-4 text-left hover:border-green-500 hover:bg-green-50 transition"
            >
              <div className="font-medium text-gray-900">Yes</div>
              <div className="text-sm text-gray-500 mt-1">Roof inspection completed</div>
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: ACTIONS.SELECT_ROOF_INSPECTED, value: 'no' })}
              className="border border-gray-200 rounded-lg p-4 text-left hover:border-red-500 hover:bg-red-50 transition"
            >
              <div className="font-medium text-gray-900">No</div>
              <div className="text-sm text-gray-500 mt-1">Inspection did not occur</div>
            </button>
          </div>
        </div>
      );
    }

    if (state.step === STEPS.INSPECTION_NOT_COMPLETED) {
      return renderInspectionNotCompletedStep();
    }

    if (state.step === STEPS.STORM_DAMAGE) {
      return (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
            <Info className="w-3.5 h-3.5" />
            {STORM_DAMAGE_BADGE}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => dispatch({ type: ACTIONS.SELECT_STORM_DAMAGE, value: 'yes' })}
              className="border border-gray-200 rounded-lg p-4 text-left hover:border-indigo-500 hover:bg-indigo-50 transition"
            >
              <div className="font-medium text-gray-900">Yes</div>
              <div className="text-sm text-gray-500 mt-1">Insurance path</div>
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: ACTIONS.SELECT_STORM_DAMAGE, value: 'no' })}
              className="border border-gray-200 rounded-lg p-4 text-left hover:border-teal-500 hover:bg-teal-50 transition"
            >
              <div className="font-medium text-gray-900">No</div>
              <div className="text-sm text-gray-500 mt-1">Retail path</div>
            </button>
          </div>
        </div>
      );
    }

    if (state.step === STEPS.INSURANCE_CLAIM) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() =>
              dispatch({ type: ACTIONS.SELECT_INSURANCE_OUTCOME, value: 'filed-claim' })
            }
            className="border border-gray-200 rounded-lg p-4 text-left hover:border-green-500 hover:bg-green-50 transition"
          >
            <div className="font-medium text-gray-900">Claim filed</div>
            <div className="text-sm text-gray-500 mt-1">Collect claim details</div>
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: ACTIONS.SELECT_INSURANCE_OUTCOME, value: 'no-claim-filed' })
            }
            className="border border-gray-200 rounded-lg p-4 text-left hover:border-red-500 hover:bg-red-50 transition"
          >
            <div className="font-medium text-gray-900">No claim filed</div>
            <div className="text-sm text-gray-500 mt-1">Capture reason and next step</div>
          </button>
        </div>
      );
    }

    if (state.step === STEPS.NO_CLAIM_REASON) {
      return renderNoClaimReasonStep();
    }

    if (state.step === STEPS.NO_PITCH_REASON) {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Why not pitching retail?
            </label>
            <select
              value={state.noPitchRetailReason}
              onChange={(event) => {
                const value = event.target.value;
                dispatch({ type: ACTIONS.SET_NO_PITCH_REASON, value });
                if (value === 'FOLLOW_UP_SCHEDULED') {
                  startFollowUp('INSURANCE_NO_CLAIM');
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            >
              <option value="">Select a reason</option>
              {NO_PITCH_RETAIL_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => goToStep(STEPS.CONFIRM)}
            disabled={
              !state.noPitchRetailReason || state.noPitchRetailReason === 'FOLLOW_UP_SCHEDULED'
            }
            className="w-full px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            Continue without follow-up
          </button>
        </div>
      );
    }

    if (state.step === STEPS.RETAIL_QUOTE) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roof size</label>
              <input
                type="number"
                value={state.quoteRoofSqFt}
                onChange={(event) => setField('quoteRoofSqFt', event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="SQ FT"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Materials</label>
              <input
                type="number"
                value={state.quoteMaterials}
                onChange={(event) => setField('quoteMaterials', event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="$"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Labor</label>
              <input
                type="number"
                value={state.quoteLabor}
                onChange={(event) => setField('quoteLabor', event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="$"
              />
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-gray-500">Estimated total</div>
            <div className="text-lg font-semibold text-gray-900">${quoteTotal.toFixed(2)}</div>
          </div>
          <button
            type="button"
            onClick={() => goToStep(STEPS.CONFIRM)}
            className="w-full px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700"
          >
            Continue
          </button>
        </div>
      );
    }

    if (state.step === STEPS.CLAIM_INFO) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Insurance company
              </label>
              <input
                type="text"
                value={state.insuranceCompany}
                onChange={(event) => setField('insuranceCompany', event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Claim number
              </label>
              <input
                type="text"
                value={state.claimNumber}
                onChange={(event) => setField('claimNumber', event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Claim filed date
              </label>
              <input
                type="date"
                value={toDateInputValue(state.claimFiledDate)}
                onChange={(event) => setField('claimFiledDate', event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of loss (optional)
              </label>
              <input
                type="date"
                value={toDateInputValue(state.dateOfLoss)}
                onChange={(event) => setField('dateOfLoss', event.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Damage location (optional)
            </label>
            <input
              type="text"
              value={state.damageLocation}
              onChange={(event) => setField('damageLocation', event.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Service Agreement signature</div>
            {!state.saPrepared ? (
              <button
                type="button"
                onClick={() => setField('saPrepared', true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg"
              >
                <FileCheck className="w-4 h-4" />
                Prepare SA for signature
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setField('saSent', true);
                  goToStep(STEPS.CONFIRM);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg"
              >
                <Send className="w-4 h-4" />
                Send for signature
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => goToStep(STEPS.CONFIRM)}
            className="w-full px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700"
          >
            Continue
          </button>
        </div>
      );
    }

    if (state.step === STEPS.RETAIL_OUTCOME) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => dispatch({ type: ACTIONS.SELECT_RETAIL_OUTCOME, value: 'yes' })}
            className="border border-gray-200 rounded-lg p-4 text-left hover:border-green-500 hover:bg-green-50 transition"
          >
            <div className="font-medium text-gray-900">Yes</div>
            <div className="text-sm text-gray-500 mt-1">Customer moving forward</div>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: ACTIONS.SELECT_RETAIL_OUTCOME, value: 'no' })}
            className="border border-gray-200 rounded-lg p-4 text-left hover:border-red-500 hover:bg-red-50 transition"
          >
            <div className="font-medium text-gray-900">No</div>
            <div className="text-sm text-gray-500 mt-1">Capture no-sale reason</div>
          </button>
        </div>
      );
    }

    if (state.step === STEPS.RETAIL_NOT_SOLD_REASON) {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason it did not sell
            </label>
            <select
              value={state.retailNoSaleReason}
              onChange={(event) =>
                dispatch({ type: ACTIONS.SET_RETAIL_NO_SALE_REASON, value: event.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            >
              <option value="">Select a reason</option>
              {RETAIL_NOT_SOLD_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => startFollowUp('RETAIL_NOT_SOLD')}
            disabled={!state.retailNoSaleReason}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
          >
            <CalendarDays className="w-4 h-4" />
            Schedule follow-up
          </button>

          <button
            type="button"
            onClick={() => goToStep(STEPS.CONFIRM)}
            disabled={!state.retailNoSaleReason}
            className="w-full px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            Continue without follow-up
          </button>
        </div>
      );
    }

    if (state.step === STEPS.FOLLOW_UP_MODE) {
      return renderFollowUpModeStep();
    }

    if (state.step === STEPS.VIRTUAL_FOLLOW_UP) {
      return renderVirtualFollowUpStep();
    }

    if (state.step === STEPS.IN_PERSON_FOLLOW_UP) {
      return renderInPersonFollowUpStep();
    }

    if (state.step === STEPS.CONFIRM) {
      return (
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-600">Disposition</span>
              <span className="font-medium text-right">{disposition.category || '-'}</span>
            </div>
            {disposition.reason && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-600">Reason</span>
                <span className="font-medium text-right">{disposition.reason}</span>
              </div>
            )}
            {disposition.followUpDate && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-600">Follow-up</span>
                <span className="font-medium text-right">
                  {formatDateTime(disposition.followUpDate)}
                </span>
              </div>
            )}
            {state.followUpMode && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-600">Follow-up type</span>
                <span className="font-medium text-right">{state.followUpMode}</span>
              </div>
            )}
          </div>

          {(state.insuranceCompany || state.claimNumber) && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm space-y-1">
              <div className="font-medium text-blue-900">Claim info</div>
              <div>Company: {state.insuranceCompany || '-'}</div>
              <div>Claim #: {state.claimNumber || '-'}</div>
              <div>Filed: {formatDate(state.claimFiledDate)}</div>
              <div>Date of loss: {formatDate(state.dateOfLoss)}</div>
              <div>Damage location: {state.damageLocation || '-'}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={state.notes}
              onChange={(event) => setField('notes', event.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {!error && previewRequested && (
            <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-100 rounded-lg p-3">
              <CheckCircle className="w-4 h-4" />
              Ready to save the appointment result.
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl sm:shadow-xl sm:max-w-3xl flex flex-col overflow-hidden">
        {renderHeader()}

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {renderStepBody()}
        </div>

        <div className="sticky bottom-0 z-20 border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-gray-400">
              {opportunity?.jobId ? `Job ${opportunity.jobId}` : 'Appointment result'}
            </div>
            <div className="grid grid-cols-1 sm:flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewRequested(true);
                  handleSubmit();
                }}
                disabled={!canSubmit() || submitMutation.isPending || state.step !== STEPS.CONFIRM}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                <ClipboardCheck className="w-4 h-4" />
                {footerActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
