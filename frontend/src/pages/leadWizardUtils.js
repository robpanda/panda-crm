import { CheckCircle, MapPin, Target, User } from 'lucide-react';

const hasValue = (value) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return Boolean(value);
};

export const LEAD_WIZARD_STEPS = [
  { id: 1, name: 'Info', icon: User, description: 'Contact details' },
  { id: 2, name: 'Address', icon: MapPin, description: 'Location info' },
  { id: 3, name: 'Qualify', icon: Target, description: 'Lead classification' },
];

export function hasLeadWizardContactMethod(formData = {}) {
  return hasValue(formData.phone) || hasValue(formData.mobilePhone) || hasValue(formData.email);
}

export function hasLeadWizardRequiredFields({
  isCallCenter = false,
  formData = {},
  hasCallCenterAppointment = false,
} = {}) {
  const hasBasicFields =
    hasValue(formData.firstName) &&
    hasValue(formData.lastName) &&
    hasLeadWizardContactMethod(formData);

  if (!hasBasicFields) {
    return false;
  }

  if (isCallCenter) {
    return (
      hasValue(formData.workType) &&
      hasValue(formData.status) &&
      hasValue(formData.leadSource) &&
      Boolean(hasCallCenterAppointment)
    );
  }

  return hasValue(formData.leadSource);
}

export function isLeadWizardSalesRole({
  roleName = '',
  roleType = '',
  isCallCenter = false,
} = {}) {
  if (isCallCenter) {
    return false;
  }

  return roleName.includes('sales') || roleType.includes('sales');
}

export function shouldDefaultLeadSourceToSelfGen({
  isNewLead = false,
  isCallCenter = false,
  isSalesRole = false,
  leadSource = '',
} = {}) {
  return Boolean(isNewLead && !isCallCenter && isSalesRole && !hasValue(leadSource));
}

export function canLeadWizardConvert({
  isNewLead = false,
  lead = null,
  hasRequiredFields = false,
  canForceConvert = false,
} = {}) {
  const leadCanConvert = isNewLead || (lead && !lead.isConverted);
  return Boolean(leadCanConvert && (hasRequiredFields || canForceConvert));
}

export const LEAD_WIZARD_SUBMIT_ICON = CheckCircle;
