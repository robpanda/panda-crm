/**
 * Panda CRM Training Bot Knowledge Base
 * Comprehensive documentation of all CRM features for AI-powered help
 */

const crmKnowledge = {
  overview: {
    name: "Panda CRM",
    description: "Panda CRM is your all-in-one platform for managing roofing and exteriors sales, from lead to completion. It's designed to be your central hub for tracking jobs, managing customers, scheduling work, and handling commissions.",
    url: "https://crm.pandaadmin.com",
    keyPrinciple: "The Opportunity (Job) is the central hub. Everything connects back to the job - contacts, quotes, work orders, documents, and commissions."
  },

  navigation: {
    mainNav: [
      { name: "Home", path: "/", description: "Dashboard with key metrics, recent activity, and quick actions" },
      { name: "Leads", path: "/leads", description: "New potential customers before they become jobs" },
      { name: "Contacts", path: "/contacts", description: "All people - homeowners, decision makers, property managers" },
      { name: "Accounts", path: "/accounts", description: "Properties/companies - each account can have multiple jobs" },
      { name: "Jobs", path: "/jobs", description: "Active opportunities/projects - the heart of the system" },
      { name: "Attention Queue", path: "/attention", description: "AI-prioritized items needing your attention" }
    ],
    secondaryNav: [
      { name: "Schedule", path: "/schedule", description: "Calendar view of all appointments and work" },
      { name: "Documents", path: "/documents", description: "Contracts, agreements, photos, and files" },
      { name: "Price Books", path: "/pricebooks", description: "Product pricing and discounts" },
      { name: "Products", path: "/products", description: "All products and services offered" },
      { name: "Campaigns", path: "/campaigns", description: "Marketing campaigns and SMS/email outreach" },
      { name: "Reports", path: "/reports", description: "Analytics, custom reports, and dashboards" }
    ],
    adminNav: [
      { name: "Workflows", path: "/admin/workflows", description: "Automated actions and triggers" },
      { name: "Commissions", path: "/admin/commissions", description: "View and approve sales commissions" },
      { name: "PandaSign", path: "/admin/pandasign", description: "E-signature and document signing" },
      { name: "Bamboogli", path: "/admin/bamboogli", description: "SMS and email messaging system" },
      { name: "Templates", path: "/admin/templates", description: "Email, SMS, and document templates" },
      { name: "Integrations", path: "/admin/integrations", description: "QuickBooks, RingCentral, CompanyCam connections" },
      { name: "User Management", path: "/admin/users", description: "Add and manage user accounts" },
      { name: "Roles & Permissions", path: "/admin/roles", description: "Control who can see and do what" },
      { name: "Audit Logs", path: "/admin/audit", description: "Track all system changes" }
    ]
  },

  features: {
    leads: {
      title: "Leads Management",
      description: "Leads are potential customers before they become jobs. They come from various sources like call center, website, referrals, and self-gen.",
      howToUse: [
        "Click 'Leads' in the sidebar to see all leads",
        "Use the 'New Lead' button or keyboard shortcut to create a lead",
        "Fill in customer info, property address, and lead source",
        "When ready, convert the lead to a job using the 'Convert' action"
      ],
      keyFeatures: [
        "Lead assignment engine - automatically routes leads based on territory and availability",
        "Lead scoring - prioritizes hot leads",
        "Quick convert - turns leads into jobs with one click",
        "Integration with RingCentral for call tracking"
      ],
      tips: [
        "Always verify the phone number before saving",
        "Add notes about the customer's project needs",
        "Check for duplicate leads before creating new ones"
      ]
    },

    contacts: {
      title: "Contacts Management",
      description: "Contacts are all the people in your system - homeowners, decision makers, insurance adjusters, property managers. A contact can be linked to multiple accounts and jobs.",
      howToUse: [
        "Navigate to 'Contacts' to see all contacts",
        "Search by name, phone, or email",
        "Click on a contact to see all their linked accounts and jobs",
        "Use the contact detail page to send SMS or email"
      ],
      keyFeatures: [
        "360-degree view of all customer interactions",
        "Communication history (calls, emails, SMS)",
        "Link contacts to multiple properties",
        "Quick actions for calling and messaging"
      ],
      tips: [
        "Always check if a contact already exists before creating",
        "Keep phone numbers in consistent format",
        "Add relationship notes for decision makers"
      ]
    },

    accounts: {
      title: "Accounts (Properties)",
      description: "Accounts represent properties or companies. For residential, an account is typically a home address. Each account can have multiple jobs over time.",
      howToUse: [
        "Go to 'Accounts' to see all properties",
        "Use the dashboard view for quick stats or list view for detailed search",
        "Click an account to see all jobs, contacts, and history",
        "Use Account Wizard to create new accounts with all details"
      ],
      keyFeatures: [
        "Complete property information and project history",
        "All jobs for the property in one place",
        "Financial summary - revenue, payments, balance",
        "Photo gallery from CompanyCam integration"
      ],
      tips: [
        "Verify the property address with Google",
        "Link all decision makers as contacts",
        "Check for existing accounts before creating duplicates"
      ]
    },

    jobs: {
      title: "Jobs (Opportunities)",
      description: "Jobs are the central hub of Panda CRM. Everything connects to a job - this is where you manage the full project from sale to completion. Jobs go through stages: Lead Assigned > Inspection > Proposal > Closed Won > In Production > Complete.",
      howToUse: [
        "Click 'Jobs' to see your pipeline",
        "Use filters to view by stage, work type, or date",
        "Click a job to open the detail view - this is your project hub",
        "Use tabs to see schedule, work orders, quotes, contacts, and more"
      ],
      stages: [
        { name: "Lead Assigned", description: "New job created from converted lead" },
        { name: "Inspection Scheduled", description: "Initial inspection appointment set" },
        { name: "Inspection Complete", description: "Inspection done, waiting for proposal" },
        { name: "Proposal", description: "Quote created and sent to customer" },
        { name: "Closed Won", description: "Customer accepted - ready for production" },
        { name: "In Production", description: "Work orders created, materials ordered" },
        { name: "Complete", description: "All work finished, final payment collected" }
      ],
      keyFeatures: [
        "Opportunity Hub - all related records in one view",
        "Stage-based workflow with automatic actions",
        "Work order management and scheduling",
        "Quote builder with product pricing",
        "Document management and PandaSign integration",
        "Commission tracking for sales team"
      ],
      tips: [
        "Keep job stage updated as you progress",
        "Add notes for anything unusual",
        "Use attention items for follow-up tasks",
        "Check the timeline for full activity history"
      ]
    },

    schedule: {
      title: "Schedule & Calendar",
      description: "The Schedule shows all appointments, work orders, and deadlines in calendar view. Supports day, week, and month views.",
      howToUse: [
        "Click 'Schedule' in the sidebar",
        "Switch between day, week, and month views",
        "Click and drag to create new appointments",
        "Click existing events to view details or reschedule"
      ],
      keyFeatures: [
        "Drag and drop scheduling",
        "Resource (technician) assignment",
        "Territory-based filtering",
        "Integration with work orders",
        "Mobile-friendly for field use"
      ],
      tips: [
        "Color codes show appointment types",
        "Double-click for quick edit",
        "Use filters to see specific crews or territories"
      ]
    },

    documents: {
      title: "Documents & PandaSign",
      description: "Documents manages all files - contracts, photos, agreements, and more. PandaSign is the built-in e-signature solution for getting contracts signed.",
      howToUse: [
        "Access Documents from the sidebar or from within a job",
        "Upload new files by dragging and dropping",
        "Use PandaSign to send contracts for signature",
        "Track document status - sent, viewed, signed"
      ],
      keyFeatures: [
        "Built-in e-signature (PandaSign)",
        "Template library for common documents",
        "Automatic PDF generation",
        "Integration with CompanyCam for photos",
        "Document expiration tracking"
      ],
      tips: [
        "Use templates for consistent contracts",
        "Send reminders for unsigned documents",
        "Organize documents by category"
      ]
    },

    quoteBuilder: {
      title: "Quote Builder",
      description: "Create professional quotes with accurate pricing from your price books. Quotes can include labor, materials, and discounts.",
      howToUse: [
        "Open a job and go to the Quotes tab",
        "Click 'New Quote' to start the builder",
        "Add products from your price book",
        "Apply discounts or adjustments",
        "Save and send for signature via PandaSign"
      ],
      keyFeatures: [
        "Product catalog integration",
        "Automatic pricing calculations",
        "Discount management",
        "Multi-segment quotes",
        "PDF export and email",
        "One-click send for signature"
      ],
      tips: [
        "Double-check quantities before sending",
        "Use price book categories for easy search",
        "Add notes explaining complex line items"
      ]
    },

    workOrders: {
      title: "Work Orders",
      description: "Work orders track the actual work to be done on a job. They connect to the schedule and field service team.",
      howToUse: [
        "Access from Jobs > Work Orders tab or the main Work Orders page",
        "Use the wizard to create new work orders",
        "Assign crews and schedule dates",
        "Track status as work progresses"
      ],
      keyFeatures: [
        "Multi-step wizard for creation",
        "Crew assignment and scheduling",
        "Material tracking",
        "Photo documentation",
        "Completion tracking"
      ],
      tips: [
        "Break large jobs into multiple work orders",
        "Add all materials before sending to crew",
        "Use notes for special instructions"
      ]
    },

    attentionQueue: {
      title: "Attention Queue",
      description: "AI-powered priority queue that surfaces items needing your attention. Riley AI analyzes your jobs, leads, and tasks to show what's most important right now.",
      howToUse: [
        "Click 'Attention Queue' in the sidebar",
        "Items are sorted by priority - highest priority first",
        "Click an item to see details and take action",
        "Mark items as resolved when complete"
      ],
      priorityLevels: [
        "Critical - Needs immediate action (overdue, customer waiting)",
        "High - Should be handled today",
        "Medium - Handle within 2-3 days",
        "Low - Nice to address when time permits"
      ],
      tips: [
        "Check Attention Queue at start of each day",
        "Resolve items promptly to keep queue clean",
        "Riley learns from your patterns over time"
      ]
    },

    commissions: {
      title: "Commissions",
      description: "Automated commission tracking for sales team. Commissions are calculated based on job revenue, type, and configured rates.",
      howToUse: [
        "View your commissions in the sidebar (or Admin > Commissions for managers)",
        "Commissions auto-generate when jobs progress through stages",
        "Track pending, approved, and paid commissions",
        "Admins can approve or adjust commission amounts"
      ],
      types: [
        "Pre-Commission - Earned when down payment received",
        "Back-End Commission - Earned when job is paid in full",
        "Self-Gen Bonus - Extra for self-generated leads",
        "Supplement Override - For additional approved supplements"
      ],
      tips: [
        "Check commission status before each pay period",
        "Submit questions before commissions are finalized",
        "Keep jobs accurate - commissions depend on correct data"
      ]
    },

    reports: {
      title: "Reports & Dashboards",
      description: "Analytics and reporting to track performance. Build custom reports or use pre-built dashboards.",
      howToUse: [
        "Go to Reports to see available reports",
        "Use Report Builder to create custom reports",
        "Access Executive Dashboards for high-level metrics",
        "Export reports to CSV or PDF"
      ],
      keyFeatures: [
        "Custom report builder with filters",
        "Pre-built executive dashboards",
        "Chart and table visualizations",
        "Scheduled report emails",
        "Role-based report access"
      ],
      tips: [
        "Save frequently-used reports as favorites",
        "Schedule reports to run automatically",
        "Use date filters to compare time periods"
      ]
    },

    campaigns: {
      title: "Campaigns (Bamboogli)",
      description: "SMS and email marketing campaigns to reach customers at scale. Bamboogli powers automated and manual messaging.",
      howToUse: [
        "Go to Campaigns to manage outreach",
        "Create new campaigns with target audience",
        "Design message content with templates",
        "Schedule or send immediately",
        "Track opens, clicks, and responses"
      ],
      keyFeatures: [
        "SMS and email support",
        "Template library with merge fields",
        "Audience segmentation",
        "Campaign analytics",
        "Opt-out management"
      ],
      tips: [
        "Test messages before bulk sending",
        "Use personalization for better engagement",
        "Check opt-out status before adding to campaigns"
      ]
    },

    integrations: {
      title: "Integrations",
      description: "Panda CRM connects with your other tools - QuickBooks for accounting, RingCentral for phone, CompanyCam for photos, and more.",
      available: [
        { name: "QuickBooks", description: "Sync customers, invoices, and payments" },
        { name: "RingCentral", description: "Click-to-dial, call logging, SMS, screen pops" },
        { name: "CompanyCam", description: "Photo sync from job sites" },
        { name: "EagleView", description: "Roof measurements and reports" },
        { name: "GAF QuickMeasure", description: "Alternative measurement service" },
        { name: "Twilio", description: "SMS messaging backbone" },
        { name: "SendGrid", description: "Email delivery" }
      ],
      tips: [
        "Check integration status in Admin > Integrations",
        "Report sync issues immediately",
        "Keep integration credentials secure"
      ]
    }
  },

  keyboardShortcuts: [
    { keys: "Cmd/Ctrl + K", action: "Global search" },
    { keys: "Cmd/Ctrl + N", action: "Create new (context-aware)" },
    { keys: "Cmd/Ctrl + /", action: "Show keyboard shortcuts" },
    { keys: "Escape", action: "Close modals and panels" }
  ],

  commonTasks: {
    createLead: {
      title: "How to Create a New Lead",
      steps: [
        "Click 'Leads' in the sidebar",
        "Click the '+ New Lead' button (or Cmd+N)",
        "Fill in the customer's name and phone number",
        "Add the property address",
        "Select the lead source (referral, website, etc.)",
        "Add any notes about the project",
        "Click 'Save' to create the lead"
      ]
    },
    convertLead: {
      title: "How to Convert a Lead to a Job",
      steps: [
        "Open the lead you want to convert",
        "Verify all information is correct",
        "Click the 'Convert to Job' button",
        "Select or create an Account (property)",
        "Confirm the job type (Insurance, Retail, etc.)",
        "Click 'Convert' - the lead becomes a job"
      ]
    },
    createQuote: {
      title: "How to Create and Send a Quote",
      steps: [
        "Open the job you want to quote",
        "Go to the 'Quotes' tab",
        "Click '+ New Quote'",
        "Add products from the price book",
        "Adjust quantities and apply discounts",
        "Preview the quote PDF",
        "Click 'Send for Signature' to email via PandaSign"
      ]
    },
    scheduleAppointment: {
      title: "How to Schedule an Appointment",
      steps: [
        "Go to 'Schedule' in the sidebar",
        "Navigate to the desired date",
        "Click and drag to create a time block",
        "Select the appointment type",
        "Link to the job and assign a technician",
        "Add any notes for the field team",
        "Click 'Save' to confirm"
      ]
    },
    sendSms: {
      title: "How to Send an SMS to a Customer",
      steps: [
        "Open the contact or job",
        "Click the SMS icon or 'Send Message' button",
        "Type your message or select a template",
        "Review the message preview",
        "Click 'Send' to deliver"
      ]
    }
  },

  troubleshooting: {
    cantFindRecord: {
      issue: "I can't find a lead/contact/job",
      solutions: [
        "Try the global search (Cmd+K) with partial names",
        "Check if you have the right filters applied",
        "Verify you have permission to view that record type",
        "Check if the record was merged or deleted"
      ]
    },
    quoteNotSaving: {
      issue: "My quote won't save",
      solutions: [
        "Check that all required fields are filled",
        "Verify product quantities are valid numbers",
        "Make sure pricing is within allowed limits",
        "Try refreshing the page and re-entering"
      ]
    },
    calendarNotLoading: {
      issue: "Schedule calendar won't load",
      solutions: [
        "Check your internet connection",
        "Try switching to a different view (day/week/month)",
        "Clear your browser cache",
        "Check if territory filters are too restrictive"
      ]
    },
    integrationIssues: {
      issue: "Integration isn't syncing",
      solutions: [
        "Check Admin > Integrations for connection status",
        "Verify API credentials are still valid",
        "Look for error messages in the sync log",
        "Contact admin if credentials need renewal"
      ]
    }
  },

  glossary: {
    "Job": "Also called Opportunity - a sales/project opportunity",
    "Account": "A property or company - the physical location of a job",
    "Contact": "A person - homeowner, decision maker, or related party",
    "Lead": "A potential customer before they become a job",
    "Work Order": "A unit of work to be completed on a job",
    "Service Appointment": "A scheduled time for work or visit",
    "PandaSign": "Built-in e-signature solution for contracts",
    "Bamboogli": "The messaging system for SMS and email",
    "Attention Queue": "AI-prioritized list of items needing action",
    "Commission": "Sales person earnings based on job revenue"
  },

  roleBasedHelp: {
    salesRep: {
      focus: ["leads", "jobs", "contacts", "quoteBuilder", "schedule"],
      keyMetrics: ["Pipeline value", "Leads pending", "Close rate", "Commissions pending"],
      dailyTasks: [
        "Check Attention Queue for priority items",
        "Follow up on pending quotes",
        "Update job stages as they progress",
        "Log all customer interactions"
      ]
    },
    projectManager: {
      focus: ["jobs", "workOrders", "schedule", "documents"],
      keyMetrics: ["Jobs in production", "Work orders pending", "Schedule conflicts", "Overdue items"],
      dailyTasks: [
        "Review production schedule",
        "Assign crews to work orders",
        "Track material deliveries",
        "Complete job close-outs"
      ]
    },
    callCenter: {
      focus: ["leads", "contacts", "campaigns"],
      keyMetrics: ["Leads created", "Appointments set", "Call volume", "Conversion rate"],
      dailyTasks: [
        "Work through lead queue",
        "Make outbound calls",
        "Schedule initial appointments",
        "Update lead information"
      ]
    },
    admin: {
      focus: ["all"],
      keyMetrics: ["System health", "User activity", "Integration status", "Pending approvals"],
      dailyTasks: [
        "Review audit logs",
        "Process commission approvals",
        "Monitor integration health",
        "Manage user access"
      ]
    }
  }
};

/**
 * First-visit onboarding tour steps
 */
const onboardingTour = {
  version: "1.0",
  steps: [
    {
      id: "welcome",
      title: "Welcome to Panda CRM!",
      content: "I'm your training assistant. Let me give you a quick tour of the system. This will only take about 2 minutes.",
      position: "center",
      actions: ["Start Tour", "Skip Tour"]
    },
    {
      id: "sidebar",
      title: "Navigation Sidebar",
      content: "This is your main navigation. You'll find all the key sections here - Leads, Contacts, Accounts, and Jobs.",
      target: ".sidebar",
      position: "right",
      highlight: true
    },
    {
      id: "jobs",
      title: "Jobs - Your Central Hub",
      content: "Jobs (Opportunities) are the heart of Panda CRM. Everything connects to a job - contacts, quotes, work orders, and documents.",
      target: "[href='/jobs']",
      position: "right",
      highlight: true
    },
    {
      id: "attention",
      title: "Attention Queue",
      content: "Riley AI analyzes your work and shows what needs attention first. Check this every morning!",
      target: "[href='/attention']",
      position: "right",
      highlight: true
    },
    {
      id: "search",
      title: "Global Search",
      content: "Press Cmd+K (Mac) or Ctrl+K (Windows) to search for anything - leads, contacts, jobs, or accounts.",
      target: ".search-input",
      position: "bottom",
      highlight: true
    },
    {
      id: "help",
      title: "I'm Here to Help!",
      content: "Click this button anytime you have questions. I can explain any feature, guide you through tasks, or help troubleshoot issues.",
      target: "#training-bot-trigger",
      position: "left",
      highlight: true
    },
    {
      id: "complete",
      title: "You're Ready!",
      content: "That's the basics! Click 'Go to Dashboard' to start, or 'Take Detailed Tour' for a deeper dive into each feature.",
      position: "center",
      actions: ["Go to Dashboard", "Take Detailed Tour"]
    }
  ],
  detailedTour: [
    {
      id: "leads-detail",
      title: "Working with Leads",
      content: "Leads come from various sources. Your job is to qualify them and convert the good ones into jobs. Let me show you the leads page.",
      target: "[href='/leads']",
      navigateTo: "/leads"
    },
    {
      id: "jobs-detail",
      title: "The Job Hub",
      content: "Click on any job to see the full project hub - schedule, work orders, quotes, contacts, documents, and more all in one place.",
      target: "[href='/jobs']",
      navigateTo: "/jobs"
    },
    {
      id: "schedule-detail",
      title: "Your Schedule",
      content: "See all appointments and work orders in calendar view. Drag and drop to reschedule.",
      target: "[href='/schedule']",
      navigateTo: "/schedule"
    }
  ]
};

/**
 * Context-aware suggestions based on current page
 */
const contextualSuggestions = {
  "/": [
    "What do the dashboard numbers mean?",
    "How do I see more detailed metrics?",
    "What should I focus on today?"
  ],
  "/leads": [
    "How do I create a new lead?",
    "How do I convert a lead to a job?",
    "What do the lead sources mean?"
  ],
  "/leads/new": [
    "What information is required?",
    "How do I check for duplicates?",
    "What happens after I save?"
  ],
  "/contacts": [
    "How do I find a specific contact?",
    "How do I merge duplicate contacts?",
    "Can I send SMS from here?"
  ],
  "/accounts": [
    "What's the difference between account and contact?",
    "How do I see all jobs for an account?",
    "How do I update property details?"
  ],
  "/jobs": [
    "What do the job stages mean?",
    "How do I move a job to the next stage?",
    "How do I filter by my jobs only?"
  ],
  "/jobs/:id": [
    "How do I add a work order?",
    "How do I create a quote?",
    "Where are the documents?",
    "How do I schedule an appointment?"
  ],
  "/schedule": [
    "How do I create a new appointment?",
    "How do I assign a technician?",
    "How do I view a different week?"
  ],
  "/documents": [
    "How do I send a document for signature?",
    "How do I upload a file?",
    "Where are signed documents stored?"
  ],
  "/quotes": [
    "How do I add products to a quote?",
    "How do I apply a discount?",
    "How do I send the quote for signature?"
  ],
  "/reports": [
    "How do I create a custom report?",
    "Can I schedule a report?",
    "How do I export to Excel?"
  ],
  "/admin/commissions": [
    "How are commissions calculated?",
    "How do I approve commissions?",
    "What is the approval process?"
  ]
};

module.exports = {
  crmKnowledge,
  onboardingTour,
  contextualSuggestions
};
