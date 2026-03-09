import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPOSITION_CATEGORIES,
  FOLLOW_UP_TYPES,
  validateAppointmentResultPayload,
} from '../appointmentResultValidation.js';

test('validates a valid virtual follow-up payload', () => {
  const payload = {
    dispositionCategory: DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED,
    dispositionReason: 'FOLLOW_UP_SCHEDULED',
    followUpType: FOLLOW_UP_TYPES.VIRTUAL,
    virtualTask: {
      taskType: 'CALL',
      dueDate: '2026-03-10',
      dueTime: '09:00',
    },
  };

  const result = validateAppointmentResultPayload(payload);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('requires followUpType for schedule categories', () => {
  const payload = {
    dispositionCategory: DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED,
    dispositionReason: 'FOLLOW_UP_SCHEDULED',
  };

  const result = validateAppointmentResultPayload(payload);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((e) => e.field === 'followUpType'),
    true
  );
});

test('requires date and time for in-person follow-up', () => {
  const payload = {
    dispositionCategory: DISPOSITION_CATEGORIES.RESCHEDULED,
    dispositionReason: 'NO_ANSWER',
    followUpType: FOLLOW_UP_TYPES.IN_PERSON,
    inPersonAppointment: {
      date: '2026-03-10',
    },
  };

  const result = validateAppointmentResultPayload(payload);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((e) => e.field === 'inPersonAppointment.time'),
    true
  );
});

test('claim filed requires claim details', () => {
  const payload = {
    dispositionCategory: DISPOSITION_CATEGORIES.INSURANCE_CLAIM_FILED,
  };
  const result = validateAppointmentResultPayload(payload);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((e) => e.field === 'claimNumber'),
    true
  );
});

test('retail sold remains valid without follow-up payload', () => {
  const payload = {
    dispositionCategory: DISPOSITION_CATEGORIES.RETAIL_SOLD,
  };
  const result = validateAppointmentResultPayload(payload);
  assert.equal(result.valid, true);
});
