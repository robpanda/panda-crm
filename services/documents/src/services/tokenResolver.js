/**
 * Token Resolver Service
 *
 * Resolves tokens (variables) in Slate AST content by fetching
 * entity data and replacing token nodes with resolved values.
 *
 * Also handles state-conditional content blocks (e.g., rescission clauses)
 * that are resolved based on the customer's state.
 */

import { prisma } from '../lib/prisma.js';
import logger from '../utils/logger.js';

// Cache for content blocks (cleared every 5 minutes)
let contentBlockCache = new Map();
let cacheLastCleared = Date.now();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize state codes
 */
function normalizeStateCode(state) {
  return (state || '').toString().trim().toUpperCase();
}

/**
 * Pick an office location based on job state
 */
function selectOfficeLocation(officeLocations, jobState) {
  if (!Array.isArray(officeLocations) || officeLocations.length === 0) {
    return null;
  }

  const normalizedState = normalizeStateCode(jobState);
  if (normalizedState) {
    const matched = officeLocations.find((location) => {
      const states = Array.isArray(location.states)
        ? location.states
        : (location.state ? [location.state] : []);
      return states.map(normalizeStateCode).includes(normalizedState);
    });
    if (matched) return matched;
  }

  return officeLocations.find((location) => location.isDefault) || officeLocations[0];
}

/**
 * Get branding profile (explicit or default)
 */
async function getBrandingProfile(brandingProfileId) {
  if (brandingProfileId) {
    const profile = await prisma.brandingProfile.findUnique({
      where: { id: brandingProfileId },
    });
    if (profile) return profile;
  }

  return prisma.brandingProfile.findFirst({
    where: { isDefault: true },
  });
}

/**
 * Clear expired cache entries
 */
function checkCache() {
  if (Date.now() - cacheLastCleared > CACHE_TTL) {
    contentBlockCache.clear();
    cacheLastCleared = Date.now();
  }
}

/**
 * Resolve a content block token (e.g., {{rescission_clause}}) based on state
 *
 * @param {string} token - The merge token (e.g., "{{rescission_clause}}")
 * @param {string} state - The customer's state (e.g., "MD", "VA")
 * @returns {string|null} - The resolved content or null if not found
 */
async function resolveContentBlock(token, state) {
  checkCache();

  const normalizedState = (state || 'DEFAULT').toUpperCase().trim();
  const formattedToken = token.startsWith('{{') ? token : `{{${token}}}`;
  const cacheKey = `${formattedToken}:${normalizedState}`;

  // Check cache first
  if (contentBlockCache.has(cacheKey)) {
    return contentBlockCache.get(cacheKey);
  }

  try {
    // Try exact state match first
    let block = await prisma.templateContentBlock.findFirst({
      where: {
        mergeToken: formattedToken,
        state: normalizedState,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    // Fall back to DEFAULT if no state-specific match
    if (!block && normalizedState !== 'DEFAULT') {
      block = await prisma.templateContentBlock.findFirst({
        where: {
          mergeToken: formattedToken,
          state: 'DEFAULT',
          isActive: true,
        },
        orderBy: { priority: 'desc' },
      });
    }

    const content = block?.content || null;
    contentBlockCache.set(cacheKey, content);

    if (content) {
      logger.info(`Resolved content block ${formattedToken} for state ${normalizedState}${block.state === 'DEFAULT' ? ' (using DEFAULT)' : ''}`);
    }

    return content;
  } catch (error) {
    logger.error(`Failed to resolve content block ${token}:`, error);
    return null;
  }
}

/**
 * Resolve all content block tokens in HTML/text content
 *
 * @param {string} content - The content containing {{tokens}}
 * @param {string} state - The customer's state
 * @returns {Object} - { resolvedContent, resolvedBlocks }
 */
export async function resolveContentBlocks(content, state) {
  if (!content || typeof content !== 'string') {
    return { resolvedContent: content, resolvedBlocks: {} };
  }

  const tokenRegex = /\{\{([^}]+)\}\}/g;
  const matches = [...content.matchAll(tokenRegex)];

  // Get unique tokens
  const uniqueTokens = [...new Set(matches.map(m => m[0]))];

  const resolvedBlocks = {};
  let resolvedContent = content;

  for (const token of uniqueTokens) {
    // Check if this is a content block token (not a data token like {{contact.firstName}})
    // Content block tokens don't have dots in them
    const tokenName = token.replace(/[{}]/g, '');
    if (tokenName.includes('.')) {
      continue; // Skip data tokens - they're handled separately
    }

    const blockContent = await resolveContentBlock(token, state);
    if (blockContent !== null) {
      resolvedContent = resolvedContent.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), blockContent);
      resolvedBlocks[token] = {
        resolved: true,
        content: blockContent,
        state: state?.toUpperCase() || 'DEFAULT',
      };
    } else {
      resolvedBlocks[token] = {
        resolved: false,
        content: null,
        state: null,
      };
    }
  }

  return { resolvedContent, resolvedBlocks };
}

/**
 * Get all available content block tokens for the template editor
 */
export async function getAvailableContentBlocks() {
  try {
    const blocks = await prisma.templateContentBlock.findMany({
      where: { isActive: true },
      select: {
        mergeToken: true,
        contentType: true,
        name: true,
        state: true,
      },
      distinct: ['mergeToken'],
    });

    // Group by content type
    const tokensByType = {};
    for (const block of blocks) {
      if (!tokensByType[block.contentType]) {
        tokensByType[block.contentType] = {
          token: block.mergeToken,
          name: block.name.replace(/ - .*$/, ''), // Remove state suffix from name
          description: `State-specific ${block.contentType.toLowerCase().replace(/_/g, ' ')}`,
          statesAvailable: [],
        };
      }
      tokensByType[block.contentType].statesAvailable.push(block.state);
    }

    return Object.values(tokensByType);
  } catch (error) {
    logger.error('Failed to get available content blocks:', error);
    return [];
  }
}

/**
 * Format a value based on its type
 */
function formatValue(value, type) {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'currency':
      if (typeof value === 'number' || !isNaN(Number(value))) {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(Number(value));
      }
      return value;

    case 'date':
      if (value instanceof Date) {
        return value.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      if (typeof value === 'string' && value) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      }
      return value;

    case 'phone':
      if (typeof value === 'string' && value) {
        // Basic US phone formatting
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length === 10) {
          return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        if (cleaned.length === 11 && cleaned[0] === '1') {
          return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
        }
      }
      return value;

    case 'email':
    case 'string':
    case 'number':
    default:
      return String(value);
  }
}

/**
 * Get a nested value from an object using dot notation path
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Build context data from entities
 */
async function buildContextData(context) {
  const {
    opportunityId,
    contactId,
    accountId,
    workOrderId,
    userId,
    brandingProfileId,
  } = context;

  const data = {
    opportunity: {},
    contact: {},
    account: {},
    workOrder: {},
    user: {},
    system: {},
    company: {},
    office: {},
  };

  // Fetch opportunity and related data
  if (opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: true,
        contact: true,
        owner: true,
      },
    });

    if (opportunity) {
      data.opportunity = {
        name: opportunity.name,
        jobId: opportunity.jobId,
        type: opportunity.type,
        amount: opportunity.amount,
        contractTotal: opportunity.contractTotal || opportunity.amount,
        street: opportunity.street,
        city: opportunity.city,
        state: opportunity.state,
        postalCode: opportunity.postalCode,
        fullAddress: [
          opportunity.street,
          opportunity.city,
          opportunity.state,
          opportunity.postalCode,
        ].filter(Boolean).join(', '),
        workType: opportunity.workType,
        description: opportunity.description,
        claimNumber: opportunity.claimNumber,
        insuranceCarrier: opportunity.insuranceCarrier,
        deductible: opportunity.deductible,
        dateOfLoss: opportunity.dateOfLoss,
      };

      // Use related account if not specified
      if (!accountId && opportunity.account) {
        data.account = {
          name: opportunity.account.name,
          phone: opportunity.account.phone,
          email: opportunity.account.email,
          billingStreet: opportunity.account.billingStreet,
          billingCity: opportunity.account.billingCity,
          billingState: opportunity.account.billingState,
          billingPostalCode: opportunity.account.billingPostalCode,
        };
      }

      // Use related contact if not specified
      if (!contactId && opportunity.contact) {
        const c = opportunity.contact;
        data.contact = {
          firstName: c.firstName,
          lastName: c.lastName,
          fullName: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
          email: c.email,
          phone: c.phone,
          mobilePhone: c.mobilePhone,
          mailingState: c.mailingState || c.state,
        };
      }

      // Use owner as user if not specified
      if (!userId && opportunity.owner) {
        const u = opportunity.owner;
        data.user = {
          firstName: u.firstName,
          lastName: u.lastName,
          fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email,
          phone: u.phone,
          title: u.title,
        };
      }
    }
  }

  // Fetch contact if specified separately
  if (contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (contact) {
      data.contact = {
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        email: contact.email,
        phone: contact.phone,
        mobilePhone: contact.mobilePhone,
        mailingState: contact.mailingState || contact.state,
      };
    }
  }

  // Fetch account if specified separately
  if (accountId) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (account) {
      data.account = {
        name: account.name,
        phone: account.phone,
        email: account.email,
        billingStreet: account.billingStreet,
        billingCity: account.billingCity,
        billingState: account.billingState,
        billingPostalCode: account.billingPostalCode,
      };
    }
  }

  // Fetch work order if specified
  if (workOrderId) {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        lineItems: true,
      },
    });

    if (workOrder) {
      // Calculate totals from line items
      let laborTotal = 0;
      let materialTotal = 0;

      if (workOrder.lineItems && workOrder.lineItems.length > 0) {
        for (const item of workOrder.lineItems) {
          const amount = Number(item.totalPrice) || 0;
          if (item.itemType === 'LABOR') {
            laborTotal += amount;
          } else {
            materialTotal += amount;
          }
        }
      }

      // Format line items list
      const lineItemsList = workOrder.lineItems
        ?.map(item => `${item.description || item.productName || 'Item'}: ${formatValue(item.totalPrice, 'currency')}`)
        .join('\n') || '';

      data.workOrder = {
        workOrderNumber: workOrder.workOrderNumber,
        totalPrice: workOrder.totalPrice || (laborTotal + materialTotal),
        laborTotal,
        materialTotal,
        lineItemsList,
      };
    }
  }

  // Fetch user if specified separately
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user) {
      data.user = {
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email,
        phone: user.phone,
        title: user.title,
      };
    }
  }

  // Branding-aware system tokens (company + office per job state)
  let brandingProfile = null;
  try {
    brandingProfile = await getBrandingProfile(brandingProfileId);
  } catch (error) {
    logger.warn('Failed to load branding profile for token resolution', { error: error.message });
  }

  const jobState =
    data.opportunity?.state ||
    data.account?.billingState ||
    data.contact?.mailingState ||
    null;

  const officeLocation = selectOfficeLocation(brandingProfile?.officeLocations, jobState);

  const baseCompany = {
    name: brandingProfile?.companyName || process.env.COMPANY_NAME || 'Panda Exteriors',
    phone: brandingProfile?.companyPhone || process.env.COMPANY_PHONE || '(800) 123-4567',
    email: brandingProfile?.companyEmail || process.env.COMPANY_EMAIL || 'info@pandaexteriors.com',
    website: brandingProfile?.companyWebsite || process.env.COMPANY_WEBSITE || 'www.pandaexteriors.com',
    address: brandingProfile?.companyAddress || process.env.COMPANY_ADDRESS || '123 Main Street, Baltimore, MD 21201',
    logoUrl: brandingProfile?.logoUrl || process.env.COMPANY_LOGO_URL,
  };

  const resolvedCompany = {
    name: officeLocation?.name || baseCompany.name,
    phone: officeLocation?.phone || baseCompany.phone,
    email: officeLocation?.email || baseCompany.email,
    website: officeLocation?.website || baseCompany.website,
    address: officeLocation?.address || baseCompany.address,
  };

  const officeState =
    normalizeStateCode(officeLocation?.state) ||
    normalizeStateCode(Array.isArray(officeLocation?.states) ? officeLocation.states[0] : '') ||
    normalizeStateCode(jobState);

  data.system = {
    currentDate: new Date(),
    currentTime: new Date(),
    currentDateTime: new Date(),
    companyName: resolvedCompany.name,
    companyPhone: resolvedCompany.phone,
    companyEmail: resolvedCompany.email,
    companyWebsite: resolvedCompany.website,
    companyAddress: resolvedCompany.address,
    companyLogo: baseCompany.logoUrl || '',
    officeName: officeLocation?.name || resolvedCompany.name,
    officePhone: officeLocation?.phone || resolvedCompany.phone,
    officeEmail: officeLocation?.email || resolvedCompany.email,
    officeWebsite: officeLocation?.website || resolvedCompany.website,
    officeAddress: officeLocation?.address || resolvedCompany.address,
    officeState,
  };

  data.company = {
    name: resolvedCompany.name,
    phone: resolvedCompany.phone,
    email: resolvedCompany.email,
    website: resolvedCompany.website,
    address: resolvedCompany.address,
  };

  data.office = {
    name: officeLocation?.name || resolvedCompany.name,
    phone: officeLocation?.phone || resolvedCompany.phone,
    email: officeLocation?.email || resolvedCompany.email,
    website: officeLocation?.website || resolvedCompany.website,
    address: officeLocation?.address || resolvedCompany.address,
    state: officeState,
    states: Array.isArray(officeLocation?.states) ? officeLocation.states : undefined,
  };

  const customerState =
    data.opportunity?.state ||
    data.account?.billingState ||
    data.contact?.mailingState ||
    'DEFAULT';

  const rescissionClause = (await resolveContentBlock('{{rescission_clause}}', customerState)) || '';
  data.system.rescissionClause = rescissionClause;
  data.rescission = {
    clause: rescissionClause,
  };
  // Alias for underscore token usage in raw text
  data.rescission_clause = rescissionClause;

  return data;
}

/**
 * Resolve a single token path to its value
 */
function resolveTokenPath(tokenPath, contextData, tokenType) {
  const value = getNestedValue(contextData, tokenPath);
  return formatValue(value, tokenType);
}

/**
 * Recursively resolve tokens in Slate AST
 * Returns a new AST with tokens replaced by their resolved values
 */
function resolveRawTokensInText(text, contextData, resolvedTokens = {}) {
  const tokenRegex = /\{\{([^}]+)\}\}/g;
  return text.replace(tokenRegex, (fullToken, tokenPathRaw) => {
    const tokenPath = String(tokenPathRaw || '').trim();
    if (!tokenPath) return fullToken;
    const value = getNestedValue(contextData, tokenPath);
    if (value === undefined || value === null || value === '') {
      return fullToken;
    }
    const formattedValue = value instanceof Date ? formatValue(value, 'date') : String(value);
    resolvedTokens[tokenPath] = formattedValue;
    return formattedValue;
  });
}

function resolveTokensInAst(nodes, contextData, resolvedTokens = {}) {
  if (!Array.isArray(nodes)) {
    return nodes;
  }

  return nodes.map(node => {
    // Handle token nodes
    if (node.type === 'token') {
      const { tokenPath, tokenType, fallback } = node;
      let resolvedValue = resolveTokenPath(tokenPath, contextData, tokenType);

      // Use fallback if no value resolved
      if (resolvedValue === '' && fallback) {
        resolvedValue = fallback;
      }

      // Track resolved tokens for audit
      resolvedTokens[tokenPath] = resolvedValue;

      // Return a new token node with the resolved value
      return {
        ...node,
        resolvedValue,
        children: node.children,
      };
    }

    // Replace raw {{tokens}} in text nodes (not Slate token elements)
    if (node && typeof node.text === 'string' && node.text.includes('{{')) {
      return {
        ...node,
        text: resolveRawTokensInText(node.text, contextData, resolvedTokens),
      };
    }

    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      return {
        ...node,
        children: resolveTokensInAst(node.children, contextData, resolvedTokens),
      };
    }

    return node;
  });
}

/**
 * Main token resolution function
 *
 * @param {Array} slateContent - Slate AST content
 * @param {Object} context - Context with entity IDs
 * @returns {Object} - { resolvedContent, resolvedTokens, contextData }
 */
export async function resolveTokens(slateContent, context) {
  try {
    logger.info('Starting token resolution', { context });

    // Build context data from entities
    const contextData = await buildContextData(context);

    // Track resolved tokens for audit
    const resolvedTokens = {};

    // Resolve tokens in the AST
    const resolvedContent = resolveTokensInAst(
      slateContent,
      contextData,
      resolvedTokens
    );

    logger.info('Token resolution complete', {
      tokenCount: Object.keys(resolvedTokens).length,
    });

    return {
      resolvedContent,
      resolvedTokens,
      contextData,
    };
  } catch (error) {
    logger.error('Token resolution failed', { error: error.message });
    throw error;
  }
}

/**
 * Extract all token paths from Slate content
 */
export function extractTokenPaths(nodes) {
  const tokens = [];

  const extract = (nodeList) => {
    if (!Array.isArray(nodeList)) return;

    for (const node of nodeList) {
      if (node.type === 'token' && node.tokenPath) {
        tokens.push({
          path: node.tokenPath,
          type: node.tokenType,
          fallback: node.fallback,
        });
      }
      if (node.children) {
        extract(node.children);
      }
    }
  };

  extract(nodes);
  return tokens;
}

/**
 * Extract raw {{tokens}} from text nodes in Slate content.
 * These are not Slate token elements and will render verbatim.
 */
export function extractRawTokensFromSlate(nodes) {
  const tokens = new Set();
  const tokenRegex = /\{\{([^}]+)\}\}/g;

  const extract = (nodeList) => {
    if (!Array.isArray(nodeList)) return;
    for (const node of nodeList) {
      if (node && typeof node.text === 'string') {
        const matches = [...node.text.matchAll(tokenRegex)];
        for (const match of matches) {
          if (match[1]) {
            tokens.add(match[1].trim());
          }
        }
      }
      if (node && node.children) {
        extract(node.children);
      }
    }
  };

  extract(nodes);
  return Array.from(tokens);
}

/**
 * Find unresolved tokens in Slate content.
 * - Token nodes with missing values (and no fallback)
 * - Raw {{tokens}} in text nodes (unsupported in Slate)
 */
export function findUnresolvedTokens(slateContent, contextData) {
  const unresolved = new Set();

  const tokenPaths = extractTokenPaths(slateContent);
  for (const token of tokenPaths) {
    const value = getNestedValue(contextData, token.path);
    if (value === undefined || value === null || value === '') {
      if (!token.fallback) {
        unresolved.add(token.path);
      }
    }
  }

  const rawTokens = extractRawTokensFromSlate(slateContent);
  for (const rawToken of rawTokens) {
    const value = getNestedValue(contextData, rawToken);
    if (value === undefined || value === null || value === '') {
      unresolved.add(rawToken);
    }
  }

  return Array.from(unresolved);
}

/**
 * Validate that all required tokens can be resolved
 */
export async function validateTokens(slateContent, context) {
  const tokenPaths = extractTokenPaths(slateContent);
  const contextData = await buildContextData(context);

  const missing = [];
  const resolved = [];

  for (const token of tokenPaths) {
    const value = getNestedValue(contextData, token.path);
    if (value === undefined || value === null || value === '') {
      if (!token.fallback) {
        missing.push(token.path);
      } else {
        resolved.push({ path: token.path, value: token.fallback, isFallback: true });
      }
    } else {
      resolved.push({ path: token.path, value, isFallback: false });
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    resolved,
    totalTokens: tokenPaths.length,
  };
}

/**
 * Resolve tokens in HTML content (both data tokens and content blocks)
 *
 * @param {string} htmlContent - HTML content with {{tokens}}
 * @param {Object} context - Context with entity IDs
 * @returns {Object} - { resolvedContent, resolvedTokens, resolvedBlocks }
 */
export async function resolveHtmlContent(htmlContent, context) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return {
      resolvedContent: htmlContent,
      resolvedTokens: {},
      resolvedBlocks: {},
    };
  }

  // Build context data
  const contextData = await buildContextData(context);

  // Determine the customer's state from context
  const customerState =
    contextData.opportunity?.state ||
    contextData.account?.billingState ||
    contextData.contact?.mailingState ||
    'DEFAULT';

  // First, resolve content blocks (rescission clauses, etc.)
  const { resolvedContent: contentAfterBlocks, resolvedBlocks } = await resolveContentBlocks(
    htmlContent,
    customerState
  );

  // Then, resolve data tokens ({{contact.firstName}}, etc.)
  const tokenRegex = /\{\{([^}]+)\}\}/g;
  let resolvedContent = contentAfterBlocks;
  const resolvedTokens = {};

  const matches = [...contentAfterBlocks.matchAll(tokenRegex)];
  for (const match of matches) {
    const fullToken = match[0];
    const tokenPath = match[1].trim();

    // Skip if already resolved as content block
    if (resolvedBlocks[fullToken]?.resolved) {
      continue;
    }

    // Try to resolve as data token
    const value = getNestedValue(contextData, tokenPath);
    if (value !== undefined && value !== null) {
      const formattedValue = formatValue(value, typeof value === 'number' ? 'currency' : 'string');
      resolvedContent = resolvedContent.replace(new RegExp(fullToken.replace(/[{}]/g, '\\$&'), 'g'), formattedValue);
      resolvedTokens[tokenPath] = formattedValue;
    }
  }

  return {
    resolvedContent,
    resolvedTokens,
    resolvedBlocks,
    customerState,
  };
}

/**
 * Determine customer state from context (opportunity -> account -> contact).
 */
export async function getCustomerStateFromContext(context) {
  const contextData = await buildContextData(context);
  const customerState =
    contextData.opportunity?.state ||
    contextData.account?.billingState ||
    contextData.contact?.mailingState ||
    'DEFAULT';

  return String(customerState || 'DEFAULT').toUpperCase().trim();
}

export default {
  resolveTokens,
  extractTokenPaths,
  extractRawTokensFromSlate,
  findUnresolvedTokens,
  validateTokens,
  resolveContentBlocks,
  resolveHtmlContent,
  getCustomerStateFromContext,
  getAvailableContentBlocks,
};
