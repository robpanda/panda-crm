import { useEffect, useMemo, useReducer, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle, AlertCircle, CalendarDays, FileCheck, Send, Info } from 'lucide-react';
import { opportunitiesApi } from '../../services/api';
import {
  ACTIONS,
  computeQuoteTotal,
  deriveDisposition,
  initialState,
  wizardReducer,
} from './wizardReducer';
import {
  DISPOSITION_CATEGORIES,
  INSPECTION_NOT_COMPLETED_REASONS,
  NO_CLAIM_REASONS,
  NO_PITCH_RETAIL_REASONS,
  RETAIL_NOT_SOLD_REASONS,
  STEPS,
  STEP_TITLES,
  STORM_DAMAGE_BADGE,
} from './wizardConstants';

const toDateInputValue = (value) => value || '';

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString();
  } catch (error) {
    return value;
  }
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
  const [showReschedulePicker, setShowReschedulePicker] = useState(false);
  const [showFollowUpPicker, setShowFollowUpPicker] = useState(false);

  const disposition = useMemo(() => deriveDisposition(state), [state]);
  const quoteTotal = useMemo(() => computeQuoteTotal(state), [state]);

  useEffect(() => {
    if (isOpen) {
      dispatch({ type: ACTIONS.RESET });
      setError('');
      setShowReschedulePicker(false);
      setShowFollowUpPicker(false);
    }
  }, [isOpen]);

  const submitMutation = useMutation({
    mutationFn: (payload) => opportunitiesApi.submitAppointmentResult(opportunityId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['opportunity', opportunityId]);
      queryClient.invalidateQueries(['opportunitySummary', opportunityId]);
      queryClient.invalidateQueries(['opportunityAppointments', opportunityId]);
      onCompleted?.(data);
      onClose();
    },
    onError: (err) => {
      setError(err?.response?.data?.error?.message || 'Failed to save appointment result');
    },
  });

  if (!isOpen) return null;

  const setField = (field, value) => dispatch({ type: ACTIONS.SET_FIELD, field, value });
  const setStep = (step) => dispatch({ type: ACTIONS.SET_STEP, step });

  const canSubmit = () => {
    if (!disposition.category) return false;
    if (
      disposition.category === DISPOSITION_CATEGORIES.RESCHEDULED &&
      !state.rescheduleDate
    ) {
      return false;
    }
    if (
      disposition.category === DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED &&
      !state.followUpDate
    ) {
      return false;
    }
    if (disposition.category === DISPOSITION_CATEGORIES.INSPECTION_NOT_COMPLETED) {
      return !!state.noInspectionReason;
    }
    if (disposition.category === DISPOSITION_CATEGORIES.INSURANCE_NO_CLAIM) {
      return !!state.noClaimReason;
    }
    if (disposition.category === DISPOSITION_CATEGORIES.RETAIL_NOT_SOLD) {
      return !!state.retailNoSaleReason;
    }
    if (disposition.category === DISPOSITION_CATEGORIES.INSURANCE_CLAIM_FILED) {
      return !!(state.insuranceCompany || state.claimNumber);
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
      appointmentId,
      dispositionCategory: disposition.category,
      dispositionReason: disposition.reason,
      followUpAt: disposition.followUpDate || null,
      insuranceCompany: state.insuranceCompany || null,
      claimNumber: state.claimNumber || null,
      claimFiledDate: state.claimFiledDate || null,
      dateOfLoss: state.dateOfLoss || null,
      damageLocation: state.damageLocation || null,
      notes: state.notes || null,
      autoStageUpdate: true,
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
        rescheduleDate: state.rescheduleDate,
        followUpDate: state.followUpDate,
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

  const renderHeader = () => (
    <div className="flex items-start justify-between border-b border-gray-200 pb-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Result Appointment</h2>
        <p className="text-sm text-gray-500">
          {STEP_TITLES[state.step]}
        </p>
      </div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  const renderFooter = () => (
    <div className="flex items-center justify-between border-t border-gray-200 pt-4">
      <div className="text-xs text-gray-400">
        {opportunity?.jobId ? `Job ${opportunity.jobId}` : 'Appointment result'}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit() || submitMutation.isPending || state.step !== STEPS.CONFIRM}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {submitMutation.isPending ? 'Saving...' : 'Submit Result'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 space-y-5">
          {renderHeader()}

          {/* Step: Roof inspected */}
          {state.step === STEPS.ROOF_INSPECTED && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => dispatch({ type: ACTIONS.SELECT_ROOF_INSPECTED, value: 'yes' })}
                  className="border border-gray-200 rounded-lg p-4 text-left hover:border-green-500 hover:bg-green-50 transition"
                >
                  <div className="font-medium text-gray-900">Yes</div>
                  <div className="text-sm text-gray-500">Roof inspection completed</div>
                </button>
                <button
                  onClick={() => dispatch({ type: ACTIONS.SELECT_ROOF_INSPECTED, value: 'no' })}
                  className="border border-gray-200 rounded-lg p-4 text-left hover:border-red-500 hover:bg-red-50 transition"
                >
                  <div className="font-medium text-gray-900">No</div>
                  <div className="text-sm text-gray-500">Inspection did not occur</div>
                </button>
              </div>
            </div>
          )}

          {/* Step: Inspection not completed */}
          {state.step === STEPS.INSPECTION_NOT_COMPLETED && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Disposition reason
                </label>
                <select
                  value={state.noInspectionReason}
                  onChange={(event) =>
                    dispatch({ type: ACTIONS.SET_NO_INSPECTION_REASON, value: event.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a reason</option>
                  {INSPECTION_NOT_COMPLETED_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowReschedulePicker((prev) => !prev)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-100"
              >
                <CalendarDays className="w-4 h-4" />
                Reschedule
              </button>

              {showReschedulePicker && (
                <input
                  type="date"
                  value={toDateInputValue(state.rescheduleDate)}
                  onChange={(event) =>
                    dispatch({ type: ACTIONS.SET_RESCHEDULE_DATE, value: event.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              )}

              <div className="flex items-center justify-end">
                <button
                  onClick={() => setStep(STEPS.CONFIRM)}
                  disabled={!state.noInspectionReason}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: Storm damage */}
          {state.step === STEPS.STORM_DAMAGE && (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
                <Info className="w-3.5 h-3.5" />
                {STORM_DAMAGE_BADGE}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => dispatch({ type: ACTIONS.SELECT_STORM_DAMAGE, value: 'yes' })}
                  className="border border-gray-200 rounded-lg p-4 text-left hover:border-indigo-500 hover:bg-indigo-50 transition"
                >
                  <div className="font-medium text-gray-900">Yes</div>
                  <div className="text-sm text-gray-500">Proceed with insurance path</div>
                </button>
                <button
                  onClick={() => dispatch({ type: ACTIONS.SELECT_STORM_DAMAGE, value: 'no' })}
                  className="border border-gray-200 rounded-lg p-4 text-left hover:border-teal-500 hover:bg-teal-50 transition"
                >
                  <div className="font-medium text-gray-900">No</div>
                  <div className="text-sm text-gray-500">Proceed with retail path</div>
                </button>
              </div>
            </div>
          )}

          {/* Step: Insurance claim outcome */}
          {state.step === STEPS.INSURANCE_CLAIM && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() =>
                    dispatch({ type: ACTIONS.SELECT_INSURANCE_OUTCOME, value: 'filed-claim' })
                  }
                  className="border border-gray-200 rounded-lg p-4 text-left hover:border-green-500 hover:bg-green-50 transition"
                >
                  <div className="font-medium text-gray-900">Claim filed</div>
                  <div className="text-sm text-gray-500">Insurance claim submitted</div>
                </button>
                <button
                  onClick={() =>
                    dispatch({ type: ACTIONS.SELECT_INSURANCE_OUTCOME, value: 'no-claim-filed' })
                  }
                  className="border border-gray-200 rounded-lg p-4 text-left hover:border-red-500 hover:bg-red-50 transition"
                >
                  <div className="font-medium text-gray-900">No claim filed</div>
                  <div className="text-sm text-gray-500">Customer did not file claim</div>
                </button>
              </div>
            </div>
          )}

          {/* Step: No claim reason */}
          {state.step === STEPS.NO_CLAIM_REASON && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <select
                  value={state.noClaimReason}
                  onChange={(event) =>
                    dispatch({ type: ACTIONS.SET_NO_CLAIM_REASON, value: event.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a reason</option>
                  {NO_CLAIM_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowFollowUpPicker((prev) => !prev)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-100"
              >
                <CalendarDays className="w-4 h-4" />
                Schedule second visit
              </button>

              {showFollowUpPicker && (
                <input
                  type="date"
                  value={toDateInputValue(state.followUpDate)}
                  onChange={(event) =>
                    dispatch({ type: ACTIONS.SET_FOLLOW_UP_DATE, value: event.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              )}

              {state.noClaimReason && state.noClaimReason !== 'FOLLOW_UP_SCHEDULED' && (
                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <div className="text-sm font-medium text-gray-700">
                    Would you like to pitch retail?
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        dispatch({ type: ACTIONS.SELECT_PITCH_RETAIL, value: 'yes' });
                      }}
                      className="border border-gray-200 rounded-lg p-3 text-left hover:border-green-500 hover:bg-green-50 transition"
                    >
                      Yes, Pitch Retail
                    </button>
                    <button
                      onClick={() => {
                        dispatch({ type: ACTIONS.SELECT_PITCH_RETAIL, value: 'no' });
                      }}
                      className="border border-gray-200 rounded-lg p-3 text-left hover:border-gray-500 hover:bg-gray-50 transition"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {state.pitchRetail === 'no' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Why not pitching retail?
                  </label>
                  <select
                    value={state.noPitchRetailReason}
                    onChange={(event) =>
                      dispatch({ type: ACTIONS.SET_NO_PITCH_REASON, value: event.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select a reason</option>
                    {NO_PITCH_RETAIL_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-end mt-3">
                    <button
                      onClick={() => setStep(STEPS.CONFIRM)}
                      disabled={!state.noPitchRetailReason}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Retail quote builder */}
          {state.step === STEPS.RETAIL_QUOTE && (
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
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setStep(STEPS.CONFIRM)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: Claim info */}
          {state.step === STEPS.CLAIM_INFO && (
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
                    Date of loss
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
                  Damage location
                </label>
                <input
                  type="text"
                  value={state.damageLocation}
                  onChange={(event) => setField('damageLocation', event.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="text-sm font-medium text-gray-700">Sign SA</div>
                {!state.saPrepared ? (
                  <button
                    onClick={() => setField('saPrepared', true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg"
                  >
                    <FileCheck className="w-4 h-4" />
                    Prepare SA for signature
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setField('saSent', true);
                      setStep(STEPS.CONFIRM);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg"
                  >
                    <Send className="w-4 h-4" />
                    Send for signature
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() => setStep(STEPS.CONFIRM)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: Retail outcome */}
          {state.step === STEPS.RETAIL_OUTCOME && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => dispatch({ type: ACTIONS.SELECT_RETAIL_OUTCOME, value: 'yes' })}
                  className="border border-gray-200 rounded-lg p-4 text-left hover:border-green-500 hover:bg-green-50 transition"
                >
                  <div className="font-medium text-gray-900">Yes</div>
                  <div className="text-sm text-gray-500">Customer moving forward</div>
                </button>
                <button
                  onClick={() => dispatch({ type: ACTIONS.SELECT_RETAIL_OUTCOME, value: 'no' })}
                  className="border border-gray-200 rounded-lg p-4 text-left hover:border-red-500 hover:bg-red-50 transition"
                >
                  <div className="font-medium text-gray-900">No</div>
                  <div className="text-sm text-gray-500">Customer not moving forward</div>
                </button>
              </div>

              {state.retailOutcome === 'no' && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowFollowUpPicker((prev) => !prev)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-100"
                  >
                    <CalendarDays className="w-4 h-4" />
                    Schedule second visit
                  </button>

                  {showFollowUpPicker && (
                    <input
                      type="date"
                      value={toDateInputValue(state.followUpDate)}
                      onChange={(event) =>
                        dispatch({ type: ACTIONS.SET_FOLLOW_UP_DATE, value: event.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason it did not sell
                    </label>
                    <select
                      value={state.retailNoSaleReason}
                      onChange={(event) =>
                        dispatch({
                          type: ACTIONS.SET_RETAIL_NO_SALE_REASON,
                          value: event.target.value,
                        })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Select a reason</option>
                      {RETAIL_NOT_SOLD_REASONS.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => setStep(STEPS.CONFIRM)}
                      disabled={!state.retailNoSaleReason}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Confirm */}
          {state.step === STEPS.CONFIRM && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Disposition</span>
                  <span className="font-medium">{disposition.category || '-'}</span>
                </div>
                {disposition.reason && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Reason</span>
                    <span className="font-medium">{disposition.reason}</span>
                  </div>
                )}
                {disposition.followUpDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Follow up</span>
                    <span className="font-medium">{formatDate(disposition.followUpDate)}</span>
                  </div>
                )}
              </div>

              {(state.insuranceCompany || state.claimNumber) && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm space-y-1">
                  <div className="font-medium text-blue-900">Claim info</div>
                  <div>Company: {state.insuranceCompany || '-'}</div>
                  <div>Claim #: {state.claimNumber || '-'}</div>
                  <div>Filed: {formatDate(state.claimFiledDate) || '-'}</div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
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

              <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-100 rounded-lg p-3">
                <CheckCircle className="w-4 h-4" />
                Ready to save the appointment result.
              </div>
            </div>
          )}

          {renderFooter()}
        </div>
      </div>
    </div>
  );
}
