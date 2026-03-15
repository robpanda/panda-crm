import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPOSITION_CATEGORIES,
  FOLLOW_UP_TYPES,
  parseDateTimeParts,
  validateAppointmentResultPayload,
} from '../appointmentResultValidation.js';

test('validates a virtual follow-up appointment result payload', () => {
  const result = validateAppointmentResultPayload({
    dispositionCategory: DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED,
    followUpType: FOLLOW_UP_TYPES.VIRTUAL,
    followUpAt: '2026-03-16T10:00:00.000Z',
    virtualTask: {
      taskType: 'CALL',
      dueDate: '2026-03-16',
      dueTime: '10:00',
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('requires in-person follow-up date and time when that mode is selected', () => {
  const result = validateAppointmentResultPayload({
    dispositionCategory: DISPOSITION_CATEGORIES.RESCHEDULED,
    followUpType: FOLLOW_UP_TYPES.IN_PERSON,
    followUpAt: '2026-03-16T10:00:00.000Z',
    inPersonAppointment: {
      date: '2026-03-16',
    },
  });

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.field === 'inPersonAppointment.time'),
    true
  );
});

test('parses date and time parts into a date', () => {
  const parsed = parseDateTimeParts('2026-03-16', '14:30');

  assert.equal(parsed instanceof Date, true);
  assert.equal(Number.isNaN(parsed.getTime()), false);
});
