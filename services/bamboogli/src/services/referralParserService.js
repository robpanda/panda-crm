/**
 * Referral Parser Service
 *
 * Parses incoming SMS/email replies to extract referral information
 * and creates Lead + ChampionReferral records.
 *
 * Expected message format (flexible):
 * "John Smith, 555-123-4567, 123 Main St, Baltimore MD 21201"
 * or
 * "Name: John Smith
 *  Phone: 555-123-4567
 *  Address: 123 Main St, Baltimore MD 21201"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Common opt-out and non-referral keywords
const NON_REFERRAL_KEYWORDS = [
  'stop', 'unsubscribe', 'cancel', 'quit', 'end', 'help',
  'yes', 'no', 'ok', 'thanks', 'thank you', 'wrong number',
  'not interested', 'remove me', 'take me off'
];

// State abbreviation to full name mapping
const STATE_MAP = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
};

/**
 * Check if a message looks like a referral submission
 *
 * Supported formats:
 * 1. Comma/newline separated: "John Smith, 555-123-4567, 123 Main St Baltimore MD"
 * 2. Space separated: "John Smith 5551234567 123 Main St Baltimore MD"
 * 3. Mixed: "John 5551234567 123 s Clinton st, Baltimore Md"
 */
export function isLikelyReferral(messageBody) {
  if (!messageBody || messageBody.length < 10) return false;

  const normalizedBody = messageBody.toLowerCase().trim();

  // Check for non-referral keywords
  for (const keyword of NON_REFERRAL_KEYWORDS) {
    if (normalizedBody === keyword || normalizedBody.startsWith(keyword + ' ')) {
      return false;
    }
  }

  // Check for phone number pattern (required for referral)
  // Support formats: 555-123-4567, (555) 123-4567, 5551234567, 555.123.4567
  const phonePattern = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})|(\(\d{3}\)\s?\d{3}[-.\s]?\d{4})|(\d{10})/;
  if (!phonePattern.test(messageBody)) {
    return false;
  }

  // Check for address indicator (number followed by word - like "123 Main")
  const hasAddressPattern = /\d+\s+[a-zA-Z]+\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|ct|court|way|pl|place)/i.test(messageBody);

  // Check for state abbreviation or full name
  const hasState = Object.keys(STATE_MAP).some(abbrev =>
    new RegExp(`\\b${abbrev}\\b`, 'i').test(messageBody)
  ) || Object.values(STATE_MAP).some(fullName =>
    new RegExp(`\\b${fullName}\\b`, 'i').test(messageBody)
  );

  // If we have a phone number AND (an address pattern OR a state), it's likely a referral
  if (hasAddressPattern || hasState) {
    return true;
  }

  // Fall back to original comma/newline check
  const segments = messageBody.split(/[,\n]+/).filter(s => s.trim().length > 2);
  return segments.length >= 2;
}

/**
 * Parse referral information from message body
 * Returns structured data or null if parsing fails
 */
export function parseReferralMessage(messageBody) {
  if (!messageBody) return null;

  const result = {
    firstName: null,
    lastName: null,
    phone: null,
    street: null,
    city: null,
    state: null,
    zipCode: null,
    rawMessage: messageBody,
    parseConfidence: 0, // 0-100
  };

  // Try structured format first (Name: xxx, Phone: xxx, Address: xxx)
  const structuredParse = parseStructuredFormat(messageBody);
  if (structuredParse && structuredParse.parseConfidence > 50) {
    return structuredParse;
  }

  // Fall back to comma/newline separated format
  const segmentParse = parseSegmentedFormat(messageBody);
  if (segmentParse && segmentParse.parseConfidence > 30) {
    return segmentParse;
  }

  return null;
}

/**
 * Parse structured format: "Name: xxx, Phone: xxx, Address: xxx"
 */
function parseStructuredFormat(messageBody) {
  const result = {
    firstName: null,
    lastName: null,
    phone: null,
    street: null,
    city: null,
    state: null,
    zipCode: null,
    rawMessage: messageBody,
    parseConfidence: 0,
  };

  // Extract labeled fields
  const nameMatch = messageBody.match(/name[:\s]+([^\n,]+)/i);
  const phoneMatch = messageBody.match(/phone[:\s]+([^\n,]+)/i) ||
                     messageBody.match(/number[:\s]+([^\n,]+)/i);
  const addressMatch = messageBody.match(/address[:\s]+([^\n]+)/i);

  if (nameMatch) {
    const { firstName, lastName } = parseName(nameMatch[1].trim());
    result.firstName = firstName;
    result.lastName = lastName;
    result.parseConfidence += 30;
  }

  if (phoneMatch) {
    result.phone = normalizePhone(phoneMatch[1].trim());
    result.parseConfidence += 40;
  }

  if (addressMatch) {
    const address = parseAddress(addressMatch[1].trim());
    Object.assign(result, address);
    result.parseConfidence += 30;
  }

  return result;
}

/**
 * Parse comma/newline separated format: "John Smith, 555-123-4567, 123 Main St Baltimore MD 21201"
 * Also handles space-separated: "John Smith 5551234567 123 Main St Baltimore MD"
 */
function parseSegmentedFormat(messageBody) {
  const result = {
    firstName: null,
    lastName: null,
    phone: null,
    street: null,
    city: null,
    state: null,
    zipCode: null,
    rawMessage: messageBody,
    parseConfidence: 0,
  };

  // Try comma/newline split first
  let segments = messageBody.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);

  // If only 1 segment (no commas/newlines), try to parse space-separated format
  if (segments.length === 1) {
    return parseSpaceSeparatedFormat(messageBody);
  }

  // Phone patterns
  const phonePattern = /^[\d\s()+.-]+$/;
  const phoneFullPattern = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})|(\(\d{3}\)\s?\d{3}[-.\s]?\d{4})|(\d{10})/;

  // Address patterns
  const addressPattern = /^\d+\s+[A-Za-z]/; // Starts with number then letter (street address)
  const zipPattern = /\d{5}(-\d{4})?/;

  for (const segment of segments) {
    // Check if it's a phone number
    if (phoneFullPattern.test(segment)) {
      result.phone = normalizePhone(segment);
      result.parseConfidence += 40;
      continue;
    }

    // Check if it's an address (starts with number)
    if (addressPattern.test(segment) || zipPattern.test(segment)) {
      const address = parseAddress(segment);
      if (address.street) {
        Object.assign(result, address);
        result.parseConfidence += 30;
      }
      continue;
    }

    // Must be a name (first valid text segment without numbers)
    if (!result.firstName && !phonePattern.test(segment) && !/\d/.test(segment.substring(0, 3))) {
      const { firstName, lastName } = parseName(segment);
      result.firstName = firstName;
      result.lastName = lastName;
      result.parseConfidence += 30;
    }
  }

  return result;
}

/**
 * Parse space-separated format: "John Smith 5551234567 123 Main St Baltimore MD"
 * This handles messages with no commas or newlines
 */
function parseSpaceSeparatedFormat(messageBody) {
  const result = {
    firstName: null,
    lastName: null,
    phone: null,
    street: null,
    city: null,
    state: null,
    zipCode: null,
    rawMessage: messageBody,
    parseConfidence: 0,
  };

  // Find and extract phone number first (10 consecutive digits)
  const phoneMatch = messageBody.match(/(\d{10})|(\d{3}[-.\s]\d{3}[-.\s]\d{4})|(\(\d{3}\)\s?\d{3}[-.\s]?\d{4})/);
  if (phoneMatch) {
    result.phone = normalizePhone(phoneMatch[0]);
    result.parseConfidence += 40;
  }

  // Extract zip code if present
  const zipMatch = messageBody.match(/\b(\d{5})(-\d{4})?\b/);
  if (zipMatch) {
    result.zipCode = zipMatch[1];
    result.parseConfidence += 10;
  }

  // Extract state
  for (const [abbrev, fullName] of Object.entries(STATE_MAP)) {
    const statePattern = new RegExp(`\\b(${abbrev}|${fullName})\\b`, 'i');
    if (statePattern.test(messageBody)) {
      result.state = abbrev;
      result.parseConfidence += 10;
      break;
    }
  }

  // Find street address (number followed by street name and type)
  const streetMatch = messageBody.match(/(\d+\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)*\s*(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|ct|court|way|pl|place))/i);
  if (streetMatch) {
    result.street = streetMatch[1].trim();
    result.parseConfidence += 20;
  }

  // Try to extract city - look for word(s) between street and state
  if (result.street && result.state) {
    // Find text between street indicator and state
    const streetEnd = messageBody.toLowerCase().indexOf(result.street.toLowerCase()) + result.street.length;
    const stateStart = messageBody.toLowerCase().indexOf(result.state.toLowerCase());
    if (stateStart > streetEnd) {
      const cityText = messageBody.substring(streetEnd, stateStart).trim().replace(/^[,\s]+|[,\s]+$/g, '');
      if (cityText.length > 0 && !/\d{5}/.test(cityText)) {
        result.city = cityText;
        result.parseConfidence += 10;
      }
    }
  }

  // Extract name - text before the phone number (usually first 1-3 words)
  if (phoneMatch) {
    const phoneIndex = messageBody.indexOf(phoneMatch[0]);
    const beforePhone = messageBody.substring(0, phoneIndex).trim();
    if (beforePhone.length > 0) {
      // Split into words and take first 1-3 as name (before any numbers)
      const words = beforePhone.split(/\s+/).filter(w => !/\d/.test(w));
      if (words.length > 0) {
        result.firstName = words[0];
        if (words.length > 1) {
          result.lastName = words.slice(1).join(' ');
        }
        result.parseConfidence += 20;
      }
    }
  }

  return result;
}

/**
 * Parse a name string into first and last name
 */
function parseName(nameStr) {
  const parts = nameStr.trim().split(/\s+/);

  if (parts.length === 0) {
    return { firstName: 'Unknown', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  // First part is first name, rest is last name
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Parse address string into components
 */
function parseAddress(addressStr) {
  const result = {
    street: null,
    city: null,
    state: null,
    zipCode: null,
  };

  // Extract zip code first
  const zipMatch = addressStr.match(/\b(\d{5})(-\d{4})?\b/);
  if (zipMatch) {
    result.zipCode = zipMatch[1];
    addressStr = addressStr.replace(zipMatch[0], '').trim();
  }

  // Extract state (2-letter abbreviation or full name)
  for (const [abbrev, fullName] of Object.entries(STATE_MAP)) {
    const statePattern = new RegExp(`\\b(${abbrev}|${fullName})\\b`, 'i');
    if (statePattern.test(addressStr)) {
      result.state = abbrev;
      addressStr = addressStr.replace(statePattern, '').trim();
      break;
    }
  }

  // Remaining text: try to split into street and city
  // Common pattern: "123 Main St, Baltimore" or "123 Main St Baltimore"
  const parts = addressStr.split(/[,]+/).map(s => s.trim()).filter(s => s.length > 0);

  if (parts.length >= 2) {
    result.street = parts[0];
    result.city = parts[parts.length - 1];
  } else if (parts.length === 1) {
    // Try to extract city from end of string
    const words = parts[0].split(/\s+/);
    if (words.length >= 3) {
      // Assume last word might be city if no obvious street indicators
      const streetIndicators = ['st', 'street', 'ave', 'avenue', 'rd', 'road', 'dr', 'drive', 'ln', 'lane', 'blvd', 'ct', 'court', 'way', 'pl', 'place'];
      let streetEndIndex = words.length;

      for (let i = 0; i < words.length; i++) {
        if (streetIndicators.includes(words[i].toLowerCase().replace(/[.,]/g, ''))) {
          streetEndIndex = i + 1;
          break;
        }
      }

      if (streetEndIndex < words.length) {
        result.street = words.slice(0, streetEndIndex).join(' ');
        result.city = words.slice(streetEndIndex).join(' ');
      } else {
        result.street = parts[0];
      }
    } else {
      result.street = parts[0];
    }
  }

  // Clean up punctuation
  if (result.street) result.street = result.street.replace(/[,]+$/, '').trim();
  if (result.city) result.city = result.city.replace(/[,]+$/, '').trim();

  return result;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhone(phone) {
  if (!phone) return null;

  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }

  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+' + cleaned;
  }

  return phone; // Return original if can't normalize
}

/**
 * Find the Champion (referrer) by phone number or email
 */
export async function findChampionByContact(phoneOrEmail) {
  if (!phoneOrEmail) return null;

  // Normalize phone for lookup
  const normalizedPhone = normalizePhone(phoneOrEmail);

  const champion = await prisma.champion.findFirst({
    where: {
      OR: [
        { phone: normalizedPhone },
        { phone: phoneOrEmail },
        { email: { equals: phoneOrEmail, mode: 'insensitive' } },
      ],
      status: 'ACTIVE',
    },
  });

  return champion;
}

/**
 * Find Contact by phone number
 */
export async function findContactByPhone(phone) {
  if (!phone) return null;

  const normalizedPhone = normalizePhone(phone);

  const contact = await prisma.contact.findFirst({
    where: {
      OR: [
        { phone: normalizedPhone },
        { phone: phone },
        { mobilePhone: normalizedPhone },
        { mobilePhone: phone },
      ],
    },
    include: {
      account: true,
    },
  });

  return contact;
}

/**
 * Check if this referral is a duplicate
 */
export async function checkDuplicateReferral(phone, street) {
  if (!phone) return null;

  const normalizedPhone = normalizePhone(phone);

  // Check for existing referral with same phone
  const existingReferral = await prisma.championReferral.findFirst({
    where: {
      phone: normalizedPhone,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existingReferral) {
    return existingReferral;
  }

  // Check for existing lead with same phone
  const existingLead = await prisma.lead.findFirst({
    where: {
      OR: [
        { phone: normalizedPhone },
        { mobilePhone: normalizedPhone },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existingLead) {
    return { type: 'lead', id: existingLead.id };
  }

  return null;
}

/**
 * Create a Lead and ChampionReferral from parsed message
 */
export async function createReferralFromMessage({
  parsedData,
  championId,
  senderPhone,
  senderEmail,
  channel, // 'SMS' or 'EMAIL'
  messageId,
  conversationId,
}) {
  // Check for duplicate
  const duplicate = await checkDuplicateReferral(parsedData.phone, parsedData.street);

  // Create the ChampionReferral record
  const referral = await prisma.championReferral.create({
    data: {
      championId: championId,
      referralCodeUsed: 'REPLY', // Special code for reply-based referrals
      firstName: parsedData.firstName || 'Unknown',
      lastName: parsedData.lastName || '',
      phone: parsedData.phone,
      email: null,
      street: parsedData.street,
      city: parsedData.city,
      state: parsedData.state,
      zipCode: parsedData.zipCode,
      description: `Submitted via ${channel} reply: "${parsedData.rawMessage.substring(0, 200)}"`,
      submittedVia: channel,
      status: duplicate ? 'DUPLICATE' : 'SUBMITTED',
      isDuplicate: !!duplicate,
      duplicate_of_id: duplicate?.id || null,
      duplicateReason: duplicate ? `Possible duplicate of existing ${duplicate.type || 'referral'}` : null,
      deviceInfo: `From: ${senderPhone || senderEmail}`,
    },
  });

  // Create the Lead record (unless duplicate)
  let lead = null;
  if (!duplicate) {
    lead = await prisma.lead.create({
      data: {
        firstName: parsedData.firstName || 'Unknown',
        lastName: parsedData.lastName || '',
        phone: parsedData.phone,
        street: parsedData.street,
        city: parsedData.city,
        state: parsedData.state,
        postalCode: parsedData.zipCode,
        source: 'Panda Champions App',
        status: 'NEW',
        is_champion_referral: true,
        referred_by_champion_id: championId,
        champion_referral_id: referral.id,
        description: `Referral submitted via ${channel} by champion. Original message: "${parsedData.rawMessage.substring(0, 500)}"`,
        leadNotes: `Champion Referral Contest Entry - Parse Confidence: ${parsedData.parseConfidence}%`,
      },
    });

    // Link lead to referral
    await prisma.championReferral.update({
      where: { id: referral.id },
      data: { leadId: lead.id },
    });

    // Increment champion's referral count
    await prisma.champion.update({
      where: { id: championId },
      data: {
        totalReferrals: { increment: 1 },
      },
    });
  }

  // Create activity record
  await prisma.activity.create({
    data: {
      type: 'REFERRAL_SUBMITTED',
      subject: `Champion Referral: ${parsedData.firstName || 'Unknown'} ${parsedData.lastName || ''}`,
      body: `Referral submitted via ${channel} reply.\nPhone: ${parsedData.phone}\nAddress: ${[parsedData.street, parsedData.city, parsedData.state, parsedData.zipCode].filter(Boolean).join(', ')}`,
      status: duplicate ? 'DUPLICATE' : 'NEW',
      sourceId: referral.id,
      sourceType: 'ChampionReferral',
      metadata: {
        championId,
        referralId: referral.id,
        leadId: lead?.id,
        channel,
        parseConfidence: parsedData.parseConfidence,
        isDuplicate: !!duplicate,
        messageId,
        conversationId,
      },
      occurredAt: new Date(),
    },
  });

  return {
    referral,
    lead,
    isDuplicate: !!duplicate,
    parseConfidence: parsedData.parseConfidence,
  };
}

export default {
  isLikelyReferral,
  parseReferralMessage,
  findChampionByContact,
  findContactByPhone,
  checkDuplicateReferral,
  createReferralFromMessage,
};
