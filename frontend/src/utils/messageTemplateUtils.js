import { formatDateMDY, formatTime12Hour } from './formatters';

const DEFAULT_ORGANIZATION_NAME = 'Panda Exteriors';

export function templateLooksLikeHtml(value = '') {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''));
}

export function getTemplateValue(record, fieldPath) {
  if (!record || !fieldPath) return undefined;

  const parts = String(fieldPath)
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

  let value = record;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }

  return value;
}

export function interpolateMessageTemplate(template, record = {}, options = {}) {
  if (!template) return '';

  const keepUnresolved = options.keepUnresolved !== false;

  return String(template).replace(/\{\{?([^}]+)\}?\}/g, (match, fieldPath) => {
    const normalizedPath = String(fieldPath || '').trim();

    // Avoid mangling CSS/JSON blocks inside HTML templates.
    if (!normalizedPath || normalizedPath.includes(':') || normalizedPath.includes('"')) {
      return match;
    }

    const value = getTemplateValue(record, normalizedPath);
    if (value === undefined || value === null || value === '') {
      return keepUnresolved ? match : '';
    }

    return String(value);
  });
}

export function htmlToPlainText(html = '') {
  const value = String(html || '');
  if (!value) return '';

  const normalizedHtml = value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<(p|div|li|tr|h[1-6])[^>]*>/gi, '\n');

  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = normalizedHtml;
    return (container.textContent || container.innerText || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return normalizedHtml
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeFullName(firstName, lastName, explicitFullName) {
  if (explicitFullName) return explicitFullName;
  return `${firstName || ''} ${lastName || ''}`.trim();
}

function normalizeAppointmentFields(mergeData = {}) {
  const scheduledStart =
    mergeData.scheduledStart ||
    mergeData.appointmentDateTime ||
    mergeData.tentativeAppointmentDateTime ||
    null;

  if (scheduledStart) {
    const parsedDate = new Date(scheduledStart);
    if (!Number.isNaN(parsedDate.getTime())) {
      return {
        date: formatDateMDY(parsedDate),
        time: formatTime12Hour(parsedDate),
        dateTime: `${formatDateMDY(parsedDate)} ${formatTime12Hour(parsedDate)}`.trim(),
      };
    }
  }

  const date =
    mergeData.appointment?.date ||
    mergeData.appointmentDate ||
    mergeData.tentativeAppointmentDate ||
    '';

  const time =
    mergeData.appointment?.time ||
    mergeData.appointmentTime ||
    mergeData.tentativeAppointmentTime ||
    '';

  return {
    date: date ? formatDateMDY(date) : '',
    time: time ? formatTime12Hour(time) : '',
    dateTime: [date ? formatDateMDY(date) : '', time ? formatTime12Hour(time) : ''].filter(Boolean).join(' ').trim(),
  };
}

export function buildMessageMergeContext(mergeData = {}, defaults = {}) {
  const firstName =
    mergeData.contact?.firstName ||
    mergeData.firstName ||
    defaults.firstName ||
    '';
  const lastName =
    mergeData.contact?.lastName ||
    mergeData.lastName ||
    defaults.lastName ||
    '';
  const fullName = normalizeFullName(
    firstName,
    lastName,
    mergeData.contact?.fullName ||
      mergeData.contact?.name ||
      mergeData.fullName ||
      defaults.fullName ||
      defaults.recipientName ||
      '',
  );
  const companyName =
    mergeData.account?.name ||
    mergeData.companyName ||
    mergeData.company ||
    defaults.companyName ||
    '';
  const email =
    mergeData.contact?.email ||
    mergeData.email ||
    defaults.email ||
    '';
  const phone =
    mergeData.contact?.phone ||
    mergeData.phone ||
    defaults.phone ||
    '';
  const appointment = normalizeAppointmentFields(mergeData);
  const organizationName =
    mergeData.organization?.name ||
    mergeData.organizationName ||
    defaults.organizationName ||
    DEFAULT_ORGANIZATION_NAME;
  const repName =
    mergeData.rep?.name ||
    mergeData.repName ||
    mergeData.ownerName ||
    mergeData.leadSetByName ||
    defaults.repName ||
    '';
  const customerName =
    mergeData.customerName ||
    fullName ||
    companyName ||
    defaults.recipientName ||
    '';

  return {
    ...mergeData,
    firstName,
    lastName,
    fullName,
    company: companyName,
    companyName,
    email,
    phone,
    customerName,
    recipientName: defaults.recipientName || mergeData.recipientName || fullName || companyName,
    organizationName,
    appointmentDate: appointment.date,
    appointmentTime: appointment.time,
    repName,
    contact: {
      ...mergeData.contact,
      firstName,
      lastName,
      fullName,
      name: mergeData.contact?.name || fullName,
      email,
      phone,
      mobilePhone: mergeData.contact?.mobilePhone || mergeData.mobilePhone || '',
    },
    organization: {
      ...mergeData.organization,
      name: organizationName,
    },
    appointment: {
      ...mergeData.appointment,
      date: appointment.date,
      time: appointment.time,
      dateTime: appointment.dateTime,
    },
    account: {
      ...mergeData.account,
      name: mergeData.account?.name || companyName,
    },
    rep: {
      ...mergeData.rep,
      name: repName,
    },
    job: {
      ...mergeData.job,
      number: mergeData.job?.number || mergeData.jobNumber || '',
    },
  };
}
