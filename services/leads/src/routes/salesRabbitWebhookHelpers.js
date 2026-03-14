export const pickFirstValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      const text = String(value).trim();
      if (text) {
        return text;
      }
    }
  }
  return null;
};

export const normalizeOptionalValue = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

export const parseBool = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
};

export const normalizeEmail = (value) => {
  const normalized = normalizeOptionalValue(value);
  return normalized ? normalized.toLowerCase() : null;
};

export const extractProvidedSecret = (req = {}) => {
  const headers = req.headers || {};
  const authHeader = headers.authorization;
  const forwardedAuthHeader =
    headers['x-forwarded-authorization']
    || headers['x-original-authorization']
    || headers['x-amzn-remapped-authorization']
    || null;
  const body = req.body || {};
  const nestedAuth = body.auth || body.authentication || body.headers || {};

  const [authType, authToken] = authHeader ? authHeader.split(' ') : [null, null];
  const [forwardedAuthType, forwardedAuthToken] = forwardedAuthHeader
    ? String(forwardedAuthHeader).split(' ')
    : [null, null];

  return pickFirstValue(
    headers['x-webhook-secret'],
    headers['x-webhook-token'],
    headers['x-salesrabbit-webhook-secret'],
    headers['x-salesrabbit-webhook-token'],
    headers['x-salesrabbit-secret'],
    headers['x-salesrabbit-token'],
    headers['x-api-key'],
    headers['x-salesrabbit-api-key'],
    headers['x-salesrabbit-signature'],
    headers['x-webhook-signature'],
    headers['x-auth-token'],
    headers['authorization-token'],
    req.query?.secret,
    req.query?.apiKey,
    req.query?.apikey,
    req.query?.token,
    body?.secret,
    body?.token,
    body?.apiKey,
    body?.api_key,
    body?.webhookSecret,
    body?.webhookToken,
    nestedAuth?.secret,
    nestedAuth?.token,
    nestedAuth?.apiKey,
    nestedAuth?.api_key,
    authType === 'ApiKey' ? authToken : null,
    forwardedAuthType === 'ApiKey' ? forwardedAuthToken : null,
    authType === 'Bearer' ? authToken : null,
    forwardedAuthType === 'Bearer' ? forwardedAuthToken : null,
    authType === 'Token' ? authToken : null,
    forwardedAuthType === 'Token' ? forwardedAuthToken : null,
    forwardedAuthHeader && !forwardedAuthToken ? forwardedAuthHeader : null,
    authHeader && !authToken ? authHeader : null,
  );
};

export const getExpectedSecrets = (env = process.env) => {
  return [
    env.SALESRABBIT_WEBHOOK_SECRET,
    env.SALESRABBIT_API_KEY,
    env.SALESRABBIT_WEBHOOK_TOKEN,
    env.SALESRABBIT_SECRET,
    env.SALESRABBIT_TOKEN,
    env.WEBHOOK_SECRET,
    env.INTERNAL_API_KEY,
  ]
    .map((value) => normalizeOptionalValue(value))
    .filter(Boolean);
};

export const shouldRequireSalesRabbitSecret = (env = process.env) => (
  parseBool(env.SALESRABBIT_REQUIRE_SECRET)
);

export const isTrustedSalesRabbitAppRequest = (req = {}, env = process.env) => {
  if (shouldRequireSalesRabbitSecret(env)) {
    return false;
  }

  const headers = req.headers || {};
  const userAgent = normalizeOptionalValue(headers['user-agent']);
  if (!userAgent || (!/^mint\//i.test(userAgent) && !/salesrabbit/i.test(userAgent))) {
    return false;
  }

  const body = req.body || {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  const payload = buildSalesRabbitLeadInput(body);
  return Boolean(
    payload.salesRabbitId
    || payload.email
    || payload.phone
    || payload.mobilePhone
    || payload.firstName
    || payload.lastName
  );
};

export const buildSalesRabbitLeadInput = (rawData = {}) => {
  const formData = rawData.formData || {};
  const metaData = rawData.leadMetaData || rawData.leadMetadata || {};
  const data = { ...metaData, ...formData, ...rawData };

  let firstName = pickFirstValue(
    data.firstName,
    data.FirstName,
    data.First_Name,
    data.contactFirstName,
    data.first_name,
    data?.contact?.firstName,
    data?.contact?.first_name,
    data?.person?.firstName,
  );
  let lastName = pickFirstValue(
    data.lastName,
    data.LastName,
    data.Last_Name,
    data.contactLastName,
    data.last_name,
    data?.contact?.lastName,
    data?.contact?.last_name,
    data?.person?.lastName,
  );

  if (!firstName && !lastName) {
    const fullName = pickFirstValue(
      data.name,
      data.Name,
      data.fullName,
      data.FullName,
      data.contactName,
    );
    if (fullName) {
      const parts = fullName.split(/\s+/);
      if (parts.length >= 2) {
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      } else if (parts.length === 1) {
        firstName = parts[0];
      }
    }
  }

  const email = normalizeEmail(
    pickFirstValue(
      data.email,
      data.Email,
      data.emailAddress,
      data.EmailAddress,
      data?.contact?.email,
      data?.person?.email,
    ),
  );

  const phone = normalizeOptionalValue(
    pickFirstValue(
      data.phonePrimary,
      data.phone,
      data.Phone,
      data.phoneNumber,
      data.primaryPhone,
      data.homePhone,
      data?.contact?.phone,
      data?.contact?.phoneNumber,
    ),
  );

  const mobilePhone = normalizeOptionalValue(
    pickFirstValue(
      data.phoneSecondary,
      data.mobilePhone,
      data.MobilePhone,
      data.Mobile_Phone,
      data.cell,
      data.cellPhone,
      data.mobile,
      data?.contact?.mobilePhone,
      data?.contact?.mobile,
    ),
  );

  const salesRabbitId = pickFirstValue(
    rawData.leadId,
    data.leadId,
    data.salesRabbitId,
    data.id,
    data.iD,
  );

  const marketingDivision = pickFirstValue(
    data.marketingDivision,
    data.MarketingDivision,
    data['Marketing Division'],
    data.division,
  );
  const retailInsurance = pickFirstValue(
    data.retailInsurance,
    data.RetailInsurance,
    data['Retail/Insurance'],
    data['Retail Insurance'],
  );
  const shingleType = pickFirstValue(
    data.shingleType,
    data.ShingleType,
    data['Shingle Type'],
    data.shingle,
  );
  const appointmentTime = pickFirstValue(data.appointmentTime, data.appointmentDate);

  const spouseFirstName = normalizeOptionalValue(data.spouseFirstName);
  const spouseLastName = normalizeOptionalValue(data.spouseLastName);
  const spouseName = spouseFirstName || spouseLastName
    ? `${spouseFirstName || ''} ${spouseLastName || ''}`.trim()
    : null;

  const sfLeadId = pickFirstValue(data.salesforceLeadID, data.salesforceLeadId, data.sfLeadId);
  const sfOppId = pickFirstValue(data.salesforceOpportunityI, data.salesforceOpportunityId, data.sfOpportunityId);

  const notes = [];
  if (salesRabbitId) notes.push(`SalesRabbit ID: ${salesRabbitId}`);
  if (marketingDivision) notes.push(`Marketing Division: ${marketingDivision}`);
  if (shingleType) notes.push(`Shingle Type: ${shingleType}`);
  if (spouseName) notes.push(`Spouse: ${spouseName}`);
  if (appointmentTime) notes.push(`Appointment: ${appointmentTime}`);
  if (parseBool(data.iConsentToRecieveSMSFromPandaExteriors) || parseBool(data.iConsentToSMSOffersFromPandaExteriors) || parseBool(data.smsConsent)) {
    notes.push('SMS Consent: Yes');
  }
  if (sfLeadId) notes.push(`SF Lead ID: ${sfLeadId}`);
  if (sfOppId) notes.push(`SF Opportunity ID: ${sfOppId}`);

  for (const noteValue of [data.note, data.notes, data.leadNotes, data.description]) {
    const normalized = normalizeOptionalValue(noteValue);
    if (normalized) notes.push(normalized);
  }

  let workType = normalizeOptionalValue(
    pickFirstValue(
      data.workType,
      data.WorkType,
      data.Work_Type,
      data['Work Type'],
      data.jobType,
      data.leadType,
      data.serviceType,
    ),
  );

  if (retailInsurance && !workType) {
    workType = retailInsurance;
  } else if (retailInsurance && workType && !workType.toLowerCase().includes(retailInsurance.toLowerCase())) {
    workType = `${retailInsurance} - ${workType}`;
  }

  return {
    data,
    salesRabbitId,
    firstName,
    lastName,
    email,
    phone,
    mobilePhone,
    street: normalizeOptionalValue(
      pickFirstValue(
        data.street1,
        data.street,
        data.Street,
        data.address,
        data.Address,
        data.streetAddress,
        data.addressLine1,
        data.address_line_1,
        data.address1,
      ),
    ),
    city: normalizeOptionalValue(pickFirstValue(data.city, data.City, data.addressCity)),
    state: normalizeOptionalValue(pickFirstValue(data.state, data.State, data.addressState, data.stateProvince)),
    postalCode: normalizeOptionalValue(
      pickFirstValue(
        data.postalCode,
        data.PostalCode,
        data.Postal_Code,
        data.zip,
        data.Zip,
        data.zipCode,
        data.zipcode,
      ),
    ),
    source: normalizeOptionalValue(pickFirstValue(data.source, data.Source, data.leadSource)) || 'SalesRabbit',
    workType,
    propertyType: normalizeOptionalValue(
      pickFirstValue(data.propertyType, data.PropertyType, data.Property_Type, data.buildingType),
    ),
    leadNotes: notes.join('\n\n') || null,
    jobNotes: normalizeOptionalValue(pickFirstValue(data.jobNotes, data.JobNotes, data['Job Notes'])),
    salesRabbitUser: normalizeEmail(
      pickFirstValue(
        data.ownerEmail,
        data.salesRabbitUser,
        data.repEmail,
        data.userEmail,
        data.assignedTo,
        data.createdBy,
        metaData.ownerEmail,
      ),
    ),
    isSelfGen: parseBool(data.isSelfGen) || parseBool(data.selfGen),
  };
};

export const validateSalesRabbitLeadInput = (payload) => {
  if (!payload.firstName && !payload.lastName) {
    return 'First name or last name is required';
  }

  if (!payload.email && !payload.phone && !payload.mobilePhone) {
    return 'At least one contact method is required';
  }

  return null;
};
