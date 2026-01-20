/**
 * Panda CRM Training Bot Lambda
 * AI-powered help assistant for CRM users
 *
 * Endpoints:
 * - POST /training-bot/chat - Send a message, get AI response
 * - GET /training-bot/onboarding - Get onboarding tour config
 * - GET /training-bot/suggestions?path=/current/path - Get contextual suggestions
 * - POST /training-bot/feedback - Submit feedback on responses
 * - GET /training-bot/analytics - Get usage analytics (admin)
 * - GET /training-bot/logs - Get chat logs (admin)
 */

const { crmKnowledge, onboardingTour, contextualSuggestions } = require('./knowledge-base');
const { getLatestPatterns, analyzeChatPatterns } = require('./learning-engine');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ region: 'us-east-2' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CHAT_LOGS_TABLE = 'panda-crm-training-bot-logs';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Training Bot Request:', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const path = event.path || event.rawPath || '';
  const method = event.httpMethod || event.requestContext?.http?.method;

  try {
    // Route to appropriate handler
    if (path.endsWith('/chat') && method === 'POST') {
      return handleChat(event);
    }

    if (path.endsWith('/onboarding') && method === 'GET') {
      return handleOnboarding(event);
    }

    if (path.endsWith('/suggestions') && method === 'GET') {
      return handleSuggestions(event);
    }

    if (path.endsWith('/feedback') && method === 'POST') {
      return handleFeedback(event);
    }

    if (path.endsWith('/analytics') && method === 'GET') {
      return handleAnalytics(event);
    }

    if (path.endsWith('/logs') && method === 'GET') {
      return handleLogs(event);
    }

    if (path.endsWith('/insights') && method === 'GET') {
      return handleInsights(event);
    }

    if (path.endsWith('/analyze') && method === 'POST') {
      return handleAnalyze(event);
    }

    if (path.endsWith('/health') && method === 'GET') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ status: 'healthy', version: '1.0.0' })
      };
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not found' })
    };
  } catch (error) {
    console.error('Training Bot Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};

/**
 * Handle chat messages - the main AI conversation
 */
async function handleChat(event) {
  const body = JSON.parse(event.body || '{}');
  const { message, conversationHistory = [], currentPath, userRole, userId, userName } = body;

  if (!message) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Message is required' })
    };
  }

  // Build context from knowledge base
  const context = buildContext(message, currentPath, userRole);

  // Generate response using knowledge base (can be enhanced with Claude API)
  const response = await generateResponse(message, context, conversationHistory);

  // Generate a unique response ID
  const responseId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Log the chat interaction to DynamoDB (async, don't wait)
  logChatInteraction({
    responseId,
    message,
    response: response.text,
    currentPath,
    userRole,
    userId,
    userName,
    suggestions: response.suggestions,
    relatedTopics: response.relatedTopics,
    timestamp: new Date().toISOString()
  }).catch(err => console.error('Failed to log chat:', err));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      responseId,
      response: response.text,
      suggestions: response.suggestions,
      relatedTopics: response.relatedTopics,
      actions: response.actions
    })
  };
}

/**
 * Log chat interaction to DynamoDB
 */
async function logChatInteraction(data) {
  const item = {
    pk: `CHAT#${data.responseId}`,
    sk: data.timestamp,
    type: 'chat',
    ...data
  };

  try {
    await docClient.send(new PutCommand({
      TableName: CHAT_LOGS_TABLE,
      Item: item
    }));
    console.log('Chat logged:', data.responseId);
  } catch (error) {
    console.error('Error logging chat:', error);
    // Don't throw - logging failure shouldn't break the chat
  }
}

/**
 * Build context from knowledge base based on the question
 */
function buildContext(message, currentPath, userRole) {
  const lowerMessage = message.toLowerCase();
  const context = {
    currentPage: getPageInfo(currentPath),
    roleInfo: userRole ? crmKnowledge.roleBasedHelp[userRole] : null,
    relevantFeatures: [],
    relevantTasks: [],
    troubleshooting: []
  };

  // Find relevant features based on keywords
  const featureKeywords = {
    leads: ['lead', 'prospect', 'potential customer', 'new customer'],
    contacts: ['contact', 'person', 'phone', 'email', 'customer'],
    accounts: ['account', 'property', 'address', 'location'],
    jobs: ['job', 'opportunity', 'project', 'sale', 'deal'],
    schedule: ['schedule', 'calendar', 'appointment', 'meeting'],
    documents: ['document', 'contract', 'agreement', 'sign', 'pandasign'],
    quoteBuilder: ['quote', 'pricing', 'price', 'estimate', 'proposal'],
    workOrders: ['work order', 'work', 'service', 'install', 'crew'],
    attentionQueue: ['attention', 'priority', 'todo', 'task', 'focus'],
    commissions: ['commission', 'pay', 'earnings', 'bonus'],
    reports: ['report', 'analytics', 'dashboard', 'metrics', 'numbers'],
    campaigns: ['campaign', 'sms', 'text', 'email', 'outreach', 'marketing']
  };

  for (const [feature, keywords] of Object.entries(featureKeywords)) {
    if (keywords.some(kw => lowerMessage.includes(kw))) {
      if (crmKnowledge.features[feature]) {
        context.relevantFeatures.push(crmKnowledge.features[feature]);
      }
    }
  }

  // Find relevant common tasks
  const taskKeywords = {
    createLead: ['create lead', 'new lead', 'add lead'],
    convertLead: ['convert lead', 'lead to job', 'lead to opportunity'],
    createQuote: ['create quote', 'new quote', 'send quote', 'make quote'],
    scheduleAppointment: ['schedule', 'appointment', 'book', 'calendar'],
    sendSms: ['send sms', 'text', 'message customer']
  };

  for (const [task, keywords] of Object.entries(taskKeywords)) {
    if (keywords.some(kw => lowerMessage.includes(kw))) {
      if (crmKnowledge.commonTasks[task]) {
        context.relevantTasks.push(crmKnowledge.commonTasks[task]);
      }
    }
  }

  // Check for troubleshooting needs
  const troubleKeywords = {
    cantFindRecord: ["can't find", 'cannot find', 'where is', 'missing', 'lost'],
    quoteNotSaving: ['quote', 'save', 'not saving', 'error'],
    calendarNotLoading: ['calendar', 'schedule', 'not loading', 'blank'],
    integrationIssues: ['integration', 'sync', 'quickbooks', 'ringcentral', 'not working']
  };

  for (const [issue, keywords] of Object.entries(troubleKeywords)) {
    if (keywords.some(kw => lowerMessage.includes(kw))) {
      if (crmKnowledge.troubleshooting[issue]) {
        context.troubleshooting.push(crmKnowledge.troubleshooting[issue]);
      }
    }
  }

  return context;
}

/**
 * Get page info from current path
 */
function getPageInfo(path) {
  if (!path) return null;

  const pathPatterns = {
    '/': { name: 'Dashboard', section: 'home' },
    '/leads': { name: 'Leads', section: 'leads' },
    '/contacts': { name: 'Contacts', section: 'contacts' },
    '/accounts': { name: 'Accounts', section: 'accounts' },
    '/jobs': { name: 'Jobs', section: 'jobs' },
    '/attention': { name: 'Attention Queue', section: 'attention' },
    '/schedule': { name: 'Schedule', section: 'schedule' },
    '/documents': { name: 'Documents', section: 'documents' },
    '/quotes': { name: 'Quote Builder', section: 'quotes' },
    '/reports': { name: 'Reports', section: 'reports' },
    '/campaigns': { name: 'Campaigns', section: 'campaigns' },
    '/admin': { name: 'Admin', section: 'admin' }
  };

  for (const [pattern, info] of Object.entries(pathPatterns)) {
    if (path === pattern || path.startsWith(pattern + '/')) {
      return info;
    }
  }

  return { name: 'Unknown', section: 'general' };
}

/**
 * Generate a response based on the message and context
 * Enhanced with better context awareness and more specific answers
 */
async function generateResponse(message, context, history) {
  const lowerMessage = message.toLowerCase();

  // Check for greetings
  if (isGreeting(lowerMessage)) {
    const pageInfo = context.currentPage;
    let greeting = `Hi there! I'm your Panda CRM training assistant.`;

    if (pageInfo && pageInfo.section !== 'home') {
      greeting += ` I see you're on the **${pageInfo.name}** page.`;
    }
    greeting += `\n\nI can help you:\n- Learn how to use any feature\n- Walk you through common tasks step-by-step\n- Explain what things mean\n- Troubleshoot issues\n\nWhat would you like help with?`;

    return {
      text: greeting,
      suggestions: getSmartSuggestions(context),
      relatedTopics: ['overview', 'navigation', 'getting-started'],
      actions: []
    };
  }

  // Check for "what can I do" type questions
  if (lowerMessage.includes('what can i do') || lowerMessage.includes('what else') || lowerMessage.includes('what are my options')) {
    return generatePageActionsResponse(context);
  }

  // Check for stage/status questions
  if (lowerMessage.includes('stage') || lowerMessage.includes('status')) {
    return generateStagesResponse(message, context);
  }

  // Check for overview/general questions
  if (lowerMessage.includes('overview') || lowerMessage.includes('what is') || lowerMessage.includes('how does')) {
    return generateOverviewResponse(context);
  }

  // Check for how-to questions
  if (lowerMessage.includes('how do i') || lowerMessage.includes('how to') || lowerMessage.includes('how can i')) {
    return generateHowToResponse(message, context);
  }

  // Check for troubleshooting
  if (context.troubleshooting.length > 0) {
    return generateTroubleshootingResponse(context);
  }

  // Check for feature-specific questions
  if (context.relevantFeatures.length > 0) {
    return generateFeatureResponse(message, context);
  }

  // Check for navigation help
  if (lowerMessage.includes('where') || lowerMessage.includes('find') || lowerMessage.includes('navigate')) {
    return generateNavigationResponse(message);
  }

  // Try to extract intent and provide smart response
  return generateSmartResponse(message, context);
}

/**
 * Get smart suggestions based on current page context
 */
function getSmartSuggestions(context) {
  const pageInfo = context.currentPage;
  const path = pageInfo?.section || 'home';

  const pageSuggestions = {
    'home': [
      "What do the dashboard metrics mean?",
      "How do I create a new lead?",
      "Where do I find my tasks?"
    ],
    'leads': [
      "How do I convert a lead to a job?",
      "What do the lead statuses mean?",
      "How do I assign a lead to someone?"
    ],
    'contacts': [
      "How do I send an SMS to this contact?",
      "How do I merge duplicate contacts?",
      "How do I see all jobs for this person?"
    ],
    'accounts': [
      "How do I see all jobs for this property?",
      "What's the difference between account and contact?",
      "How do I add a new contact to this account?"
    ],
    'jobs': [
      "What do the job stages mean?",
      "How do I create a quote for this job?",
      "How do I schedule an appointment?"
    ],
    'attention': [
      "How is priority determined?",
      "How do I mark an item as resolved?",
      "What do the different colors mean?"
    ],
    'schedule': [
      "How do I create a new appointment?",
      "How do I assign a crew?",
      "How do I reschedule an appointment?"
    ],
    'documents': [
      "How do I send a document for signature?",
      "How do I upload a new document?",
      "How do I use document templates?"
    ],
    'quotes': [
      "How do I add products to a quote?",
      "How do I apply a discount?",
      "How do I send the quote for signature?"
    ],
    'reports': [
      "How do I create a custom report?",
      "Can I schedule a report to run automatically?",
      "How do I export to Excel?"
    ],
    'campaigns': [
      "How do I create an SMS campaign?",
      "How do I select recipients?",
      "How do I use templates?"
    ]
  };

  return pageSuggestions[path] || pageSuggestions['home'];
}

/**
 * Generate response about what actions are available on current page
 */
function generatePageActionsResponse(context) {
  const pageInfo = context.currentPage;
  const section = pageInfo?.section || 'home';

  const pageActions = {
    'home': {
      title: 'Dashboard',
      actions: [
        '**View Metrics** - See key performance indicators at a glance',
        '**Quick Actions** - Create new leads, jobs, or appointments from the dashboard',
        '**Recent Activity** - See the latest updates across your records',
        '**Attention Queue Preview** - See high-priority items needing action'
      ],
      tips: 'The dashboard is your starting point - it shows what needs attention and provides quick access to common actions.'
    },
    'leads': {
      title: 'Leads Page',
      actions: [
        '**Create New Lead** - Click "+ New Lead" to add a potential customer',
        '**Convert Lead** - Click on a lead and use "Convert to Job" when ready',
        '**Filter & Search** - Use the filters to find specific leads',
        '**Bulk Actions** - Select multiple leads to assign or update them together',
        '**View Lead Details** - Click any lead to see full information and history'
      ],
      tips: 'Leads are potential customers before they become jobs. Convert them once you\'ve qualified the opportunity.'
    },
    'contacts': {
      title: 'Contacts Page',
      actions: [
        '**Search Contacts** - Find by name, phone, or email',
        '**View Contact Details** - See all linked accounts and jobs',
        '**Send SMS/Email** - Communicate directly from the contact page',
        '**Add New Contact** - Create contacts for people who aren\'t leads',
        '**Link to Account** - Associate contacts with properties/accounts'
      ],
      tips: 'Contacts are the people in your system. One contact can be linked to multiple properties.'
    },
    'accounts': {
      title: 'Accounts Page',
      actions: [
        '**View Account Details** - See property info and all related jobs',
        '**Create New Job** - Start a new opportunity for this property',
        '**View History** - See all past projects at this location',
        '**Add Contacts** - Link decision makers to the account',
        '**View Financial Summary** - See revenue and payment status'
      ],
      tips: 'Accounts represent properties. Each property can have multiple jobs over time.'
    },
    'jobs': {
      title: 'Jobs (Opportunities) Page',
      actions: [
        '**View Job Hub** - Click a job to see all related information',
        '**Move Stages** - Progress jobs through the sales pipeline',
        '**Create Quotes** - Build and send proposals',
        '**Schedule Work** - Add appointments and work orders',
        '**Manage Documents** - Upload and send contracts for signature',
        '**Filter Pipeline** - View by stage, date, or owner'
      ],
      tips: 'Jobs are the heart of Panda CRM. Everything connects to a job - this is your project hub.'
    },
    'attention': {
      title: 'Attention Queue',
      actions: [
        '**Review Priority Items** - Items sorted by AI-determined priority',
        '**Take Action** - Click items to see details and respond',
        '**Mark Resolved** - Clear items when handled',
        '**Snooze Items** - Delay items for later follow-up',
        '**Filter by Type** - Focus on specific categories'
      ],
      tips: 'Check your Attention Queue at the start of each day. It surfaces what needs attention most.'
    },
    'schedule': {
      title: 'Schedule & Calendar',
      actions: [
        '**Create Appointments** - Click and drag to add new time slots',
        '**Reschedule** - Drag appointments to new times/dates',
        '**Assign Resources** - Choose which crew handles each job',
        '**Switch Views** - Toggle between day, week, and month',
        '**Filter by Territory** - Focus on specific areas'
      ],
      tips: 'The calendar shows all scheduled work. Drag and drop to easily reschedule.'
    },
    'documents': {
      title: 'Documents Page',
      actions: [
        '**Upload Files** - Drag and drop or click to upload',
        '**Send for Signature** - Use PandaSign for contracts',
        '**Use Templates** - Start from pre-built document templates',
        '**Track Status** - See which documents are pending signatures',
        '**Download/Share** - Access and distribute documents'
      ],
      tips: 'Documents are linked to jobs. Use PandaSign for e-signatures on contracts.'
    },
    'quotes': {
      title: 'Quote Builder',
      actions: [
        '**Add Products** - Select from your price book',
        '**Adjust Quantities** - Set amounts for each line item',
        '**Apply Discounts** - Add percentage or fixed discounts',
        '**Preview PDF** - See how the quote will look',
        '**Send for Signature** - Email via PandaSign'
      ],
      tips: 'Quotes pull pricing from your price books. Always preview before sending.'
    },
    'reports': {
      title: 'Reports Page',
      actions: [
        '**Run Pre-built Reports** - Access standard reports',
        '**Create Custom Reports** - Build your own with filters',
        '**Export Data** - Download as CSV or PDF',
        '**Schedule Reports** - Automate recurring reports',
        '**Save Favorites** - Quick access to frequent reports'
      ],
      tips: 'Reports help you track performance. Save frequently-used reports as favorites.'
    },
    'campaigns': {
      title: 'Campaigns (Bamboogli)',
      actions: [
        '**Create Campaign** - Set up SMS or email outreach',
        '**Select Audience** - Choose recipients by tags or segments',
        '**Design Message** - Write content or use templates',
        '**Schedule Send** - Set timing for delivery',
        '**Track Results** - Monitor opens, clicks, and responses'
      ],
      tips: 'Test your messages before sending to large audiences.'
    }
  };

  const info = pageActions[section] || pageActions['home'];
  let text = `**${info.title} - Available Actions**\n\n`;
  info.actions.forEach(action => {
    text += `${action}\n`;
  });
  text += `\n**💡 Tip:** ${info.tips}`;

  return {
    text,
    suggestions: getSmartSuggestions(context),
    relatedTopics: [section],
    actions: []
  };
}

/**
 * Generate response about job stages
 */
function generateStagesResponse(message, context) {
  const stages = crmKnowledge.features.jobs.stages;

  let text = `**Job Stages in Panda CRM**\n\nJobs progress through these stages:\n\n`;
  stages.forEach((stage, i) => {
    text += `**${i + 1}. ${stage.name}**\n${stage.description}\n\n`;
  });
  text += `To move a job to the next stage, open the job and click the stage dropdown, or use the "Move to Next Stage" action.`;

  return {
    text,
    suggestions: [
      "How do I convert a lead to a job?",
      "What happens when a job is Closed Won?",
      "How do I mark a job complete?"
    ],
    relatedTopics: ['jobs', 'pipeline'],
    actions: []
  };
}

/**
 * Smart response that tries to understand intent
 */
function generateSmartResponse(message, context) {
  const lowerMessage = message.toLowerCase();

  // Check for specific keywords and provide targeted responses
  const intentPatterns = [
    { patterns: ['commission', 'pay', 'money', 'earned'], feature: 'commissions' },
    { patterns: ['quote', 'proposal', 'price', 'estimate'], feature: 'quoteBuilder' },
    { patterns: ['schedule', 'appointment', 'calendar', 'book'], feature: 'schedule' },
    { patterns: ['document', 'contract', 'sign', 'signature'], feature: 'documents' },
    { patterns: ['work order', 'crew', 'install', 'production'], feature: 'workOrders' },
    { patterns: ['attention', 'priority', 'urgent', 'todo'], feature: 'attentionQueue' },
    { patterns: ['report', 'analytics', 'metric', 'dashboard'], feature: 'reports' },
    { patterns: ['campaign', 'sms', 'email', 'message', 'text'], feature: 'campaigns' },
    { patterns: ['lead', 'prospect', 'potential'], feature: 'leads' },
    { patterns: ['contact', 'person', 'customer', 'client'], feature: 'contacts' },
    { patterns: ['account', 'property', 'address', 'location'], feature: 'accounts' },
    { patterns: ['job', 'opportunity', 'project', 'deal', 'sale'], feature: 'jobs' }
  ];

  for (const intent of intentPatterns) {
    if (intent.patterns.some(p => lowerMessage.includes(p))) {
      const feature = crmKnowledge.features[intent.feature];
      if (feature) {
        let text = `**${feature.title}**\n\n${feature.description}\n\n`;

        if (feature.howToUse) {
          text += `**Getting Started:**\n`;
          feature.howToUse.slice(0, 3).forEach((step, i) => {
            text += `${i + 1}. ${step}\n`;
          });
        }

        if (feature.tips && feature.tips.length > 0) {
          text += `\n**Pro Tip:** ${feature.tips[0]}`;
        }

        return {
          text,
          suggestions: [
            `How do I use ${feature.title}?`,
            `What are the key features of ${feature.title}?`,
            "Show me something else"
          ],
          relatedTopics: [feature.title.toLowerCase()],
          actions: []
        };
      }
    }
  }

  // If still no match, provide context-aware default
  return generateDefaultResponse(message, context);
}

function isGreeting(message) {
  const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'help', 'start'];
  return greetings.some(g => message.includes(g)) && message.length < 30;
}

function generateOverviewResponse(context) {
  const overview = crmKnowledge.overview;
  const nav = crmKnowledge.navigation;

  let text = `**${overview.name}**\n\n${overview.description}\n\n`;
  text += `**Key Principle:** ${overview.keyPrinciple}\n\n`;
  text += `**Main Sections:**\n`;

  nav.mainNav.forEach(item => {
    text += `- **${item.name}** - ${item.description}\n`;
  });

  return {
    text,
    suggestions: [
      "Tell me more about Jobs",
      "How do I create my first lead?",
      "What is the Attention Queue?"
    ],
    relatedTopics: ['navigation', 'jobs', 'leads'],
    actions: []
  };
}

function generateHowToResponse(message, context) {
  // If we have a matching task, return step-by-step
  if (context.relevantTasks.length > 0) {
    const task = context.relevantTasks[0];
    let text = `**${task.title}**\n\n`;
    task.steps.forEach((step, i) => {
      text += `${i + 1}. ${step}\n`;
    });

    // Provide related follow-up suggestions
    const followUpSuggestions = getRelatedTaskSuggestions(task.title);

    return {
      text,
      suggestions: followUpSuggestions,
      relatedTopics: [task.title.toLowerCase().replace(/ /g, '-')],
      actions: []
    };
  }

  // If we have relevant features, provide how-to from feature
  if (context.relevantFeatures.length > 0) {
    const feature = context.relevantFeatures[0];
    let text = `**${feature.title}**\n\n`;
    text += `${feature.description}\n\n`;
    text += `**How to use:**\n`;
    feature.howToUse.forEach((step, i) => {
      text += `${i + 1}. ${step}\n`;
    });

    if (feature.tips && feature.tips.length > 0) {
      text += `\n**Tips:**\n`;
      feature.tips.forEach(tip => {
        text += `- ${tip}\n`;
      });
    }

    // Get feature-specific follow-up suggestions
    const featureSuggestions = getFeatureFollowUpSuggestions(feature.title);

    return {
      text,
      suggestions: featureSuggestions,
      relatedTopics: [feature.title.toLowerCase().replace(/ /g, '-')],
      actions: []
    };
  }

  // Default how-to response
  return {
    text: "I'd be happy to help! Could you be more specific about what you're trying to do?\n\nHere are some common tasks I can help with:\n- Creating leads and converting them to jobs\n- Building and sending quotes\n- Scheduling appointments\n- Managing work orders\n- Using the Attention Queue",
    suggestions: [
      "How do I create a lead?",
      "How do I send a quote?",
      "How do I schedule an appointment?"
    ],
    relatedTopics: ['common-tasks'],
    actions: []
  };
}

/**
 * Get related task suggestions based on what they just learned
 */
function getRelatedTaskSuggestions(taskTitle) {
  const relatedTasks = {
    'How to Create a New Lead': [
      "How do I convert a lead to a job?",
      "How do I assign leads to team members?",
      "How do I check for duplicate leads?"
    ],
    'How to Convert a Lead to a Job': [
      "How do I create a quote?",
      "How do I schedule an inspection?",
      "What are the job stages?"
    ],
    'How to Create and Send a Quote': [
      "How do I apply a discount?",
      "How do I track if the quote was viewed?",
      "What happens after they sign?"
    ],
    'How to Schedule an Appointment': [
      "How do I assign a crew?",
      "How do I reschedule?",
      "How do I see all appointments for a job?"
    ],
    'How to Send an SMS to a Customer': [
      "Can I use message templates?",
      "How do I send bulk messages?",
      "How do I see message history?"
    ]
  };

  return relatedTasks[taskTitle] || [
    "What else can I do here?",
    "Show me another common task",
    "How do I get back to the dashboard?"
  ];
}

/**
 * Get feature-specific follow-up suggestions
 */
function getFeatureFollowUpSuggestions(featureTitle) {
  const suggestions = {
    'Leads Management': [
      "How do I convert a lead to a job?",
      "What do the lead sources mean?",
      "How do I filter my leads?"
    ],
    'Contacts Management': [
      "How do I send SMS to a contact?",
      "How do I link a contact to multiple properties?",
      "How do I merge duplicates?"
    ],
    'Accounts (Properties)': [
      "How do I see all jobs for a property?",
      "How do I add a contact to this account?",
      "What's the account vs contact difference?"
    ],
    'Jobs (Opportunities)': [
      "What do the stages mean?",
      "How do I create a quote?",
      "How do I add a work order?"
    ],
    'Schedule & Calendar': [
      "How do I assign a crew?",
      "How do I drag to reschedule?",
      "How do I filter by territory?"
    ],
    'Documents & PandaSign': [
      "How do I send for signature?",
      "How do I use templates?",
      "How do I track document status?"
    ],
    'Quote Builder': [
      "How do I add a discount?",
      "How do I preview the PDF?",
      "How do I send for signature?"
    ],
    'Work Orders': [
      "How do I assign a crew?",
      "How do I add materials?",
      "How do I mark complete?"
    ],
    'Attention Queue': [
      "How is priority calculated?",
      "How do I mark resolved?",
      "How often does it refresh?"
    ],
    'Commissions': [
      "How are commissions calculated?",
      "When do I get paid?",
      "What's pre-commission vs back-end?"
    ],
    'Reports & Dashboards': [
      "How do I build a custom report?",
      "Can I schedule reports?",
      "How do I export data?"
    ],
    'Campaigns (Bamboogli)': [
      "How do I select recipients?",
      "How do I track results?",
      "Can I schedule sends?"
    ]
  };

  return suggestions[featureTitle] || [
    "Tell me about another feature",
    "How do I get started?",
    "What are the common tasks?"
  ];
}

function generateTroubleshootingResponse(context) {
  const issue = context.troubleshooting[0];
  let text = `**Troubleshooting: ${issue.issue}**\n\n`;
  text += `Here are some solutions to try:\n\n`;
  issue.solutions.forEach((solution, i) => {
    text += `${i + 1}. ${solution}\n`;
  });
  text += `\nIf none of these work, please contact your admin or the support team.`;

  return {
    text,
    suggestions: [
      "This didn't help - I need more assistance",
      "Show me something else"
    ],
    relatedTopics: ['troubleshooting', 'support'],
    actions: []
  };
}

function generateFeatureResponse(message, context) {
  const feature = context.relevantFeatures[0];
  const lowerMessage = message.toLowerCase();

  let text = `**${feature.title}**\n\n`;
  text += `${feature.description}\n\n`;

  // Check what aspect they're asking about
  if (lowerMessage.includes('how')) {
    text += `**How to use:**\n`;
    feature.howToUse.forEach((step, i) => {
      text += `${i + 1}. ${step}\n`;
    });
  } else if (lowerMessage.includes('feature') || lowerMessage.includes('what can')) {
    text += `**Key Features:**\n`;
    feature.keyFeatures.forEach(f => {
      text += `- ${f}\n`;
    });
  } else {
    // General overview
    if (feature.keyFeatures) {
      text += `**Key Features:**\n`;
      feature.keyFeatures.slice(0, 4).forEach(f => {
        text += `- ${f}\n`;
      });
    }
  }

  if (feature.tips && feature.tips.length > 0) {
    text += `\n**Pro Tips:**\n`;
    feature.tips.forEach(tip => {
      text += `- ${tip}\n`;
    });
  }

  return {
    text,
    suggestions: [
      `How do I use ${feature.title}?`,
      "What are the keyboard shortcuts?",
      "Show me a different feature"
    ],
    relatedTopics: [feature.title.toLowerCase().replace(/ /g, '-')],
    actions: []
  };
}

function generateNavigationResponse(message) {
  const lowerMessage = message.toLowerCase();
  const nav = crmKnowledge.navigation;

  // Search all nav items
  const allItems = [...nav.mainNav, ...nav.secondaryNav, ...nav.adminNav];

  for (const item of allItems) {
    if (lowerMessage.includes(item.name.toLowerCase())) {
      return {
        text: `**${item.name}** is located at \`${item.path}\`\n\n${item.description}\n\nYou can find it in the sidebar navigation.`,
        suggestions: [
          `Tell me more about ${item.name}`,
          "What else is in the sidebar?"
        ],
        relatedTopics: [item.name.toLowerCase()],
        actions: [{
          type: 'navigate',
          path: item.path,
          label: `Go to ${item.name}`
        }]
      };
    }
  }

  // General navigation help
  let text = "Here's where you can find things in Panda CRM:\n\n";
  text += "**Main Navigation (sidebar):**\n";
  nav.mainNav.forEach(item => {
    text += `- ${item.name} → ${item.path}\n`;
  });
  text += "\n**Secondary Navigation:**\n";
  nav.secondaryNav.forEach(item => {
    text += `- ${item.name} → ${item.path}\n`;
  });

  return {
    text,
    suggestions: [
      "Tell me about Jobs",
      "Where do I find reports?",
      "How do I access admin settings?"
    ],
    relatedTopics: ['navigation'],
    actions: []
  };
}

function generateDefaultResponse(message, context) {
  const pageInfo = context.currentPage;
  const smartSuggestions = getSmartSuggestions(context);

  let text = "";
  if (pageInfo && pageInfo.name !== 'Unknown') {
    text = `I want to make sure I help you correctly. You're currently on the **${pageInfo.name}** page.\n\n`;
  } else {
    text = "I want to make sure I help you correctly.\n\n";
  }

  text += "Here's what I can help with:\n\n";
  text += "- **\"How do I...\"** - Step-by-step guides for any task\n";
  text += "- **\"What is...\"** - Explanations of features and concepts\n";
  text += "- **\"Where can I find...\"** - Navigate to any section\n";
  text += "- **Feature names** - Just mention leads, jobs, quotes, etc.\n\n";
  text += "Try one of the suggestions below, or ask your question a different way!";

  return {
    text,
    suggestions: smartSuggestions,
    relatedTopics: ['getting-started', 'overview'],
    actions: []
  };
}

/**
 * Handle onboarding tour request
 */
async function handleOnboarding(event) {
  const queryParams = event.queryStringParameters || {};
  const detailed = queryParams.detailed === 'true';

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      tour: detailed ? [...onboardingTour.steps, ...onboardingTour.detailedTour] : onboardingTour.steps,
      version: onboardingTour.version
    })
  };
}

/**
 * Handle contextual suggestions based on current page
 */
async function handleSuggestions(event) {
  const queryParams = event.queryStringParameters || {};
  const currentPath = queryParams.path || '/';

  // Match path to suggestions
  let suggestions = contextualSuggestions['/'];

  for (const [pattern, suggs] of Object.entries(contextualSuggestions)) {
    if (pattern === currentPath || currentPath.startsWith(pattern.replace(':id', ''))) {
      suggestions = suggs;
      break;
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ suggestions })
  };
}

/**
 * Handle feedback on bot responses
 */
async function handleFeedback(event) {
  const body = JSON.parse(event.body || '{}');
  const { responseId, helpful, feedback, userId, userName } = body;

  // Store feedback in DynamoDB
  const feedbackItem = {
    pk: `FEEDBACK#${responseId}`,
    sk: new Date().toISOString(),
    type: 'feedback',
    responseId,
    helpful,
    feedback,
    userId,
    userName,
    timestamp: new Date().toISOString()
  };

  try {
    await docClient.send(new PutCommand({
      TableName: CHAT_LOGS_TABLE,
      Item: feedbackItem
    }));
    console.log('Feedback stored:', responseId, helpful);
  } catch (error) {
    console.error('Error storing feedback:', error);
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      message: 'Thank you for your feedback!'
    })
  };
}

/**
 * Handle analytics request - returns summary stats
 */
async function handleAnalytics(event) {
  try {
    // Scan all items from the table
    const result = await docClient.send(new ScanCommand({
      TableName: CHAT_LOGS_TABLE,
      Limit: 10000
    }));

    const items = result.Items || [];

    // Separate chats and feedback
    const chats = items.filter(i => i.type === 'chat');
    const feedback = items.filter(i => i.type === 'feedback');

    // Calculate analytics
    const totalChats = chats.length;
    const totalFeedback = feedback.length;
    const helpfulCount = feedback.filter(f => f.helpful === true).length;
    const unhelpfulCount = feedback.filter(f => f.helpful === false).length;

    // Get unique users
    const uniqueUsers = new Set(chats.map(c => c.userId).filter(Boolean));

    // Get chat by page
    const chatsByPage = {};
    chats.forEach(chat => {
      const page = chat.currentPath || 'unknown';
      chatsByPage[page] = (chatsByPage[page] || 0) + 1;
    });

    // Get most common questions (extract keywords)
    const questionFrequency = {};
    chats.forEach(chat => {
      const msg = (chat.message || '').toLowerCase();
      // Extract key phrases
      const phrases = ['how do i', 'what is', 'where', 'help', 'create', 'find', 'schedule', 'quote', 'lead', 'job', 'commission'];
      phrases.forEach(phrase => {
        if (msg.includes(phrase)) {
          questionFrequency[phrase] = (questionFrequency[phrase] || 0) + 1;
        }
      });
    });

    // Get chats over time (last 7 days)
    const now = new Date();
    const chatsByDay = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      chatsByDay[dateStr] = 0;
    }

    chats.forEach(chat => {
      if (chat.timestamp) {
        const dateStr = chat.timestamp.split('T')[0];
        if (chatsByDay[dateStr] !== undefined) {
          chatsByDay[dateStr]++;
        }
      }
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        summary: {
          totalChats,
          totalFeedback,
          helpfulCount,
          unhelpfulCount,
          helpfulPercentage: totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0,
          uniqueUsers: uniqueUsers.size
        },
        chatsByPage: Object.entries(chatsByPage)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([page, count]) => ({ page, count })),
        topQuestionTypes: Object.entries(questionFrequency)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([type, count]) => ({ type, count })),
        chatsByDay: Object.entries(chatsByDay).map(([date, count]) => ({ date, count }))
      })
    };
  } catch (error) {
    console.error('Analytics error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to fetch analytics' })
    };
  }
}

/**
 * Handle logs request - returns recent chat logs
 */
async function handleLogs(event) {
  const queryParams = event.queryStringParameters || {};
  const limit = parseInt(queryParams.limit) || 50;
  const page = queryParams.page || null;

  try {
    const result = await docClient.send(new ScanCommand({
      TableName: CHAT_LOGS_TABLE,
      Limit: limit,
      ExclusiveStartKey: page ? JSON.parse(decodeURIComponent(page)) : undefined
    }));

    const items = result.Items || [];

    // Sort by timestamp descending
    const sortedItems = items.sort((a, b) => {
      const timeA = a.timestamp || a.sk;
      const timeB = b.timestamp || b.sk;
      return timeB.localeCompare(timeA);
    });

    // Group feedback with their chats
    const chats = sortedItems.filter(i => i.type === 'chat');
    const feedback = sortedItems.filter(i => i.type === 'feedback');

    // Create a feedback lookup by responseId
    const feedbackLookup = {};
    feedback.forEach(f => {
      feedbackLookup[f.responseId] = f;
    });

    // Enrich chats with their feedback
    const enrichedChats = chats.map(chat => ({
      ...chat,
      feedback: feedbackLookup[chat.responseId] || null
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        logs: enrichedChats,
        nextPage: result.LastEvaluatedKey
          ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
          : null,
        total: enrichedChats.length
      })
    };
  } catch (error) {
    console.error('Logs error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to fetch logs' })
    };
  }
}

/**
 * Handle insights request - returns learning patterns and recommendations
 */
async function handleInsights(event) {
  try {
    const patterns = await getLatestPatterns();

    if (!patterns) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'No analysis available yet. Run /analyze to generate insights.',
          patterns: null
        })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        timestamp: patterns.timestamp,
        totalInteractions: patterns.totalInteractions,
        patterns: patterns.patterns,
        recommendations: patterns.recommendations,
        summary: {
          commonQuestionsCount: patterns.patterns?.commonQuestions?.length || 0,
          unhelpfulResponsesCount: patterns.patterns?.unhelpfulResponses?.length || 0,
          topIssuesCount: patterns.patterns?.topIssues?.length || 0,
          knowledgeGapsCount: patterns.patterns?.knowledgeGaps?.length || 0,
          highPriorityRecommendations: patterns.recommendations?.filter(r => r.priority === 'high').length || 0,
        }
      })
    };
  } catch (error) {
    console.error('Insights error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to fetch insights' })
    };
  }
}

/**
 * Handle analyze request - triggers pattern analysis
 */
async function handleAnalyze(event) {
  try {
    console.log('Starting on-demand pattern analysis...');
    const analysis = await analyzeChatPatterns();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Analysis completed successfully',
        timestamp: analysis.timestamp,
        totalInteractions: analysis.totalInteractions,
        recommendations: analysis.recommendations.length,
        highPriorityCount: analysis.recommendations.filter(r => r.priority === 'high').length,
      })
    };
  } catch (error) {
    console.error('Analyze error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Analysis failed',
        message: error.message
      })
    };
  }
}
