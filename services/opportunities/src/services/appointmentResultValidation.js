export const DISPOSITION_CATEGORIES = {
  INSPECTION_NOT_COMPLETED: 'INSPECTION_NOT_COMPLETED',
  RESCHEDULED: 'RESCHEDULED',
  FOLLOW_UP_SCHEDULED: 'FOLLOW_UP_SCHEDULED',
  INSURANCE_CLAIM_FILED: 'INSURANCE_CLAIM_FILED',
  INSURANCE_NO_CLAIM: 'INSURANCE_NO_CLAIM',
  RETAIL_SOLD: 'RETAIL_SOLD',
  RETAIL_NOT_SOLD: 'RETAIL_NOT_SOLD',
};

export const FOLLOW_UP_TYPES = {
  VIRTUAL: 'VIRTUAL',
  IN_PERSON: 'IN_PERSON',
};

const isValidDate = (value) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

export function parseDateTimeParts(dateValue, timeValue, fallbackTime = '09:00') {
  if (!dateValue) return null;
  const timePart = timeValue || fallbackTime;
  const parsed = new Date(`${dateValue}T${timePart}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function validateAppointmentResultPayload(payload = {}) {
  const errors = [];
  const category = payload.dispositionCategory;

  if (!category || !Object.values(DISPOSITION_CATEGORIES).includes(category)) {
    errors.push({
      field: 'dispositionCategory',
      message: 'Valid dispositionCategory is required',
    });
  }

  if (category === DISPOSITION_CATEGORIES.INSPECTION_NOT_COMPLETED && !payload.dispositionReason) {
    errors.push({
      field: 'dispositionReason',
      message: 'Reason is required for inspection not completed',
    });
  }

  if (category === DISPOSITION_CATEGORIES.INSURANCE_NO_CLAIM && !payload.dispositionReason) {
    errors.push({
      field: 'dispositionReason',
      message: 'Reason is required for no claim filed',
    });
  }

  if (category === DISPOSITION_CATEGORIES.RETAIL_NOT_SOLD && !payload.dispositionReason) {
    errors.push({
      field: 'dispositionReason',
      message: 'Reason is required for retail not sold',
    });
  }

  if (category === DISPOSITION_CATEGORIES.INSURANCE_CLAIM_FILED) {
    const hasClaimInfo = payload.insuranceCompany || payload.claimNumber;
    if (!hasClaimInfo) {
      errors.push({
        field: 'claimNumber',
        message: 'Claim number or insurance company is required',
      });
    }
  }

  const followUpType = payload.followUpType;
  const hasScheduleCategory =
    category === DISPOSITION_CATEGORIES.RESCHEDULED ||
    category === DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED;

  if (hasScheduleCategory && !followUpType) {
    errors.push({
      field: 'followUpType',
      message: 'followUpType is required when disposition indicates a follow-up',
    });
  }

  if (followUpType && !Object.values(FOLLOW_UP_TYPES).includes(followUpType)) {
    errors.push({
      field: 'followUpType',
      message: 'followUpType must be VIRTUAL or IN_PERSON',
    });
  }

  if (followUpType === FOLLOW_UP_TYPES.VIRTUAL) {
    const virtualTask = payload.virtualTask || {};
    if (!virtualTask.taskType) {
      errors.push({
        field: 'virtualTask.taskType',
        message: 'Virtual follow-up task type is required',
      });
    }
    if (!virtualTask.dueDate) {
      errors.push({
        field: 'virtualTask.dueDate',
        message: 'Virtual follow-up due date is required',
      });
    }
    if (virtualTask.dueDate && !parseDateTimeParts(virtualTask.dueDate, virtualTask.dueTime)) {
      errors.push({
        field: 'virtualTask.dueDate',
        message: 'Virtual follow-up due date/time is invalid',
      });
    }
  }

  if (followUpType === FOLLOW_UP_TYPES.IN_PERSON) {
    const inPerson = payload.inPersonAppointment || {};
    if (!inPerson.date) {
      errors.push({
        field: 'inPersonAppointment.date',
        message: 'In-person appointment date is required',
      });
    }
    if (!inPerson.time) {
      errors.push({
        field: 'inPersonAppointment.time',
        message: 'In-person appointment time is required',
      });
    }
    if (inPerson.date && inPerson.time && !parseDateTimeParts(inPerson.date, inPerson.time)) {
      errors.push({
        field: 'inPersonAppointment.time',
        message: 'In-person appointment date/time is invalid',
      });
    }
  }

  if (payload.followUpAt && !isValidDate(payload.followUpAt)) {
    errors.push({ field: 'followUpAt', message: 'followUpAt must be a valid date/time' });
  }

  return { valid: errors.length === 0, errors };
}
