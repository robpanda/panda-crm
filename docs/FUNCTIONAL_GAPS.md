# Panda CRM Functional Gaps Analysis

This document identifies the functional gaps that must be closed **before shutting down Salesforce**. Each gap represents functionality currently in Salesforce that needs a Panda CRM equivalent.

## Goal: Complete Salesforce Shutdown

**Timeline Target:** 8-12 weeks to feature parity, then Salesforce sunset

**Blocking Criteria:** Salesforce cannot be shut down until ALL Critical gaps are resolved.

| Status | Meaning |
|--------|---------|
| ✅ Complete | Ready for production |
| ⚠️ Partial | Exists but incomplete |
| ❌ Not Started | Must be built from scratch |

---

## Core Architecture: Opportunity Hub Model

**CRITICAL**: Panda CRM follows an **Opportunity-Centric Hub Architecture** where Opportunity is the central object for all project-related data. Every feature and gap must be implemented with this model in mind.

```
                              ┌─────────────────────┐
                              │    OPPORTUNITY      │
                              │   (Project Hub)     │
                              └──────────┬──────────┘
                                         │
        ┌────────────┬───────────┬───────┼───────┬───────────┬────────────┐
        │            │           │       │       │           │            │
        ▼            ▼           ▼       ▼       ▼           ▼            ▼
   ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────┐ ┌───────┐ ┌──────────┐ ┌────────┐
   │ Account │ │ Contact  │ │WorkOrder│ │Quote│ │Service│ │Commission│ │Activity│
   │(Customer)│ │(Primary) │ │        │ │    │ │Contract│ │          │ │(Tasks) │
   └─────────┘ └──────────┘ └────┬───┘ └────┘ └───────┘ └──────────┘ └────────┘
                                  │
                                  ▼
                          ┌──────────────┐
                          │   Service    │
                          │ Appointment  │
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │   Assigned   │
                          │   Resource   │
                          └──────────────┘
```

**All related records flow through Opportunity:**
- WorkOrders → linked via `opportunityId`
- ServiceAppointments → linked via WorkOrder → Opportunity
- Quotes → linked via `opportunityId`
- ServiceContracts → linked via `opportunityId`
- Commissions → linked via ServiceContract → Opportunity
- Tasks/Activity → linked via `opportunityId`
- Documents/Agreements → linked via `opportunityId`
- CompanyCam Photos → linked via `opportunityId`
- Cases → linked via Account → Opportunity

---

## Gap Summary Dashboard

| Category | Total Gaps | Critical | High | Medium | Low |
|----------|------------|----------|------|--------|-----|
| Backend Services | 16 | 6 | 6 | 3 | 1 |
| Frontend Features | 22 | 8 | 9 | 4 | 1 |
| Integrations | 8 | 3 | 3 | 2 | 0 |
| Automation/Workflows | 6 | 2 | 2 | 1 | 1 |
| **TOTAL** | **52** | **19** | **20** | **10** | **3** |

### Key Architecture Principle
**All gaps must be implemented with the Opportunity Hub model in mind.** When building any feature:
1. Ask: "How does this relate to Opportunity?"
2. Ensure proper `opportunityId` foreign keys exist
3. Build API endpoints that support Opportunity-centric queries
4. UI components should allow navigation to/from Opportunity hub

---

## 1. Backend Services Gaps

### 1.1 Reports Service (NOT DEPLOYED)
**Status:** Code exists but NOT deployed to ECS
**Priority:** CRITICAL

**Missing:**
- [ ] Deploy reports service to ECS cluster
- [ ] Add ALB routing rule for `/api/reports*`
- [ ] Add ALB routing rule for `/api/dashboards*`
- [ ] Add ALB routing rule for `/api/analytics*`
- [ ] Connect to PostgreSQL database
- [ ] Test endpoints with authentication

**Files:**
- Service code: `/Users/robwinters/panda-crm/services/reports/`
- Dockerfile needed
- ECS task definition needed

---

### 1.2 Field Service Scheduling Engine
**Status:** Schema exists, service partially implemented
**Priority:** CRITICAL

**Missing:**
- [ ] Scheduling optimization algorithm (FSL replacement)
- [ ] Territory-based assignment logic
- [ ] Crew availability checking
- [ ] Appointment conflict detection
- [ ] Google Calendar sync (2-way)
- [ ] Resource skills matching
- [ ] Operating hours enforcement

**Current State:**
- ServiceAppointment, WorkOrder, ServiceResource models defined
- Basic CRUD operations in workorders service
- No scheduling intelligence

**Salesforce Comparison:**
Salesforce FSL provides:
- Automatic scheduling based on skills, territory, travel time
- Optimization engine for route efficiency
- Emergency dispatch capabilities
- Gantt chart UI for dispatchers

---

### 1.3 Commission Calculation Engine
**Status:** Schema exists, rules engine partial
**Priority:** CRITICAL

**Missing:**
- [ ] Real-time commission calculation on ServiceContract changes
- [ ] Pre-commission vs Backend commission logic
- [ ] Self-Gen vs Company Lead rate application
- [ ] Manager/Regional/Director/Executive hierarchy payouts
- [ ] Commission approval workflow
- [ ] Payroll export integration
- [ ] Commission adjustment/clawback handling
- [ ] PM add-on commission logic

**Current State:**
- Commission, CommissionRule, CommissionPlan, CommissionTier models defined
- Admin UI for commission rules exists
- No automated calculation triggers

**Salesforce Comparison:**
Salesforce uses complex Flow + Apex triggers:
- `BackEnd_Commission_Ready` flow triggers on Invoice balance
- `Trigger_Service_Contract_Record_Trigger_Flow` creates commissions
- Custom hierarchy lookup for manager chain

---

### 1.4 Invoicing & Billing Engine
**Status:** Schema exists, Stripe integration partial
**Priority:** HIGH

**Missing:**
- [ ] Invoice generation from ServiceContract
- [ ] Late fee calculation (1.5% per 30 days)
- [ ] Payment plan scheduling
- [ ] Automatic payment reminders
- [ ] Invoice PDF generation
- [ ] QuickBooks sync for invoices
- [ ] Stripe hosted invoice pages
- [ ] Payment allocation to invoices

**Current State:**
- Invoice, Payment, PaymentSchedule models defined
- Stripe integration started
- QuickBooks integration documented but not complete

---

### 1.5 Document Generation
**Status:** PandaSign exists, PDF generation missing
**Priority:** HIGH

**Missing:**
- [ ] Contract PDF generation from templates
- [ ] Merge field support (customer name, address, amounts)
- [ ] Quote PDF generation
- [ ] Invoice PDF generation
- [ ] Work order PDF generation
- [ ] Bulk document generation

**Current State:**
- PandaSign e-signature system built
- Agreement templates exist
- No PDF generation library integrated

---

### 1.6 Email Service
**Status:** NOT IMPLEMENTED
**Priority:** HIGH

**Missing:**
- [ ] Transactional email sending (SendGrid/SES)
- [ ] Email templates with merge fields
- [ ] Email tracking (opens, clicks)
- [ ] Email threading/conversation view
- [ ] Automated email triggers
- [ ] Unsubscribe handling
- [ ] Bounce handling

**Current State:**
- No EmailMessage model in schema
- No email service
- Campaign system has basic email capability

---

### 1.7 Search Service
**Status:** Basic query, no full-text search
**Priority:** HIGH

**Missing:**
- [ ] Global search across all objects
- [ ] Full-text search with relevance ranking
- [ ] Recent items tracking
- [ ] Search suggestions/autocomplete
- [ ] Saved searches
- [ ] Search filters

**Options:**
- PostgreSQL full-text search
- Elasticsearch/OpenSearch
- Algolia

---

### 1.8 Notification Service
**Status:** NOT IMPLEMENTED
**Priority:** MEDIUM

**Missing:**
- [ ] In-app notifications
- [ ] Push notifications (mobile)
- [ ] Notification preferences
- [ ] Real-time WebSocket updates
- [ ] @mention support in notes
- [ ] Assignment notifications

---

### 1.9 Activity Tracking
**Status:** Partial
**Priority:** MEDIUM

**Missing:**
- [ ] Event (calendar) model and service
- [ ] Call logging with duration/disposition
- [ ] Activity timeline aggregation
- [ ] Activity rollup on parent records
- [ ] Auto-logging of emails/calls

---

### 1.10 File Storage Service
**Status:** Schema exists, S3 integration missing
**Priority:** MEDIUM

**Missing:**
- [ ] S3 file upload API
- [ ] File type validation
- [ ] Virus scanning
- [ ] Thumbnail generation for images
- [ ] File versioning
- [ ] File sharing links with expiry

---

### 1.11 Opportunity Hub API Endpoints
**Status:** Partial - most endpoints exist but not all hub relationships
**Priority:** CRITICAL
**Architecture Role:** These endpoints power the Opportunity Hub detail page

**Missing Opportunity-Centric Endpoints:**
- [ ] `GET /api/opportunities/:id/summary` - Hub overview with counts of all related records
- [ ] `GET /api/opportunities/:id/workorders` - All WorkOrders for this Opportunity
- [ ] `GET /api/opportunities/:id/appointments` - All ServiceAppointments (via WorkOrders)
- [ ] `GET /api/opportunities/:id/quotes` - All Quotes for this Opportunity
- [ ] `GET /api/opportunities/:id/contracts` - All ServiceContracts for this Opportunity
- [ ] `GET /api/opportunities/:id/invoices` - All Invoices (via ServiceContracts)
- [ ] `GET /api/opportunities/:id/payments` - All Payments (via Invoices)
- [ ] `GET /api/opportunities/:id/commissions` - All Commissions (via ServiceContracts)
- [ ] `GET /api/opportunities/:id/documents` - All Agreements and Documents
- [ ] `GET /api/opportunities/:id/photos` - CompanyCam photos for this project
- [ ] `GET /api/opportunities/:id/activity` - Unified activity timeline (tasks, events, notes, stage changes)
- [ ] `GET /api/opportunities/:id/timeline` - Full project timeline with milestones

**Hub Aggregation Logic:**
```javascript
// Each hub endpoint should include Opportunity context
GET /api/opportunities/:id/workorders
Response: {
  opportunityId: "opp_123",
  opportunityName: "Panda Ext-12345 - Johnson Roof",
  opportunityStage: "In Production",
  workOrders: [
    { id: "wo_1", status: "Completed", ... },
    { id: "wo_2", status: "In Progress", ... }
  ],
  summary: {
    total: 2,
    completed: 1,
    inProgress: 1
  }
}
```

---

## 2. Frontend Feature Gaps

### 2.1 Opportunity Detail Page (THE HUB)
**Status:** Basic view exists
**Priority:** CRITICAL
**Architecture Role:** This is the CENTRAL HUB - must display ALL project-related data

**Missing Hub Components:**
- [ ] **Hub Overview Section** - Status summary, key metrics at a glance
- [ ] **Activity Timeline** - Unified chronological view of ALL activity (tasks, calls, emails, stage changes)
- [ ] **Related WorkOrders Tab** - List with status, dates, crew assignments
- [ ] **Related ServiceAppointments Tab** - Schedule view with assigned resources
- [ ] **Related Quotes Tab** - Quote list with status, amounts, sent/signed dates
- [ ] **Related ServiceContracts Tab** - Contract details, payment status
- [ ] **Related Invoices/Payments Tab** - Invoice list with balance due, payment history
- [ ] **Commission Preview Tab** - Pre-commission and backend commission calculations
- [ ] **Documents Tab** - All agreements, signed contracts, change orders
- [ ] **Photos Tab** - CompanyCam integration, before/after galleries
- [ ] **Notes/Chatter Feed** - Communication history, internal notes
- [ ] **Quick Actions Bar** - Schedule Appointment, Create Quote, Send Contract, etc.
- [ ] **Hub Navigation** - Easy traversal to Account, Contact, related records

**Hub Data Flow:**
```
Opportunity Page loads → Fetches ALL related records:
  ├── GET /api/opportunities/:id (core data)
  ├── GET /api/opportunities/:id/workorders
  ├── GET /api/opportunities/:id/appointments
  ├── GET /api/opportunities/:id/quotes
  ├── GET /api/opportunities/:id/contracts
  ├── GET /api/opportunities/:id/invoices
  ├── GET /api/opportunities/:id/commissions
  ├── GET /api/opportunities/:id/documents
  ├── GET /api/opportunities/:id/photos
  ├── GET /api/opportunities/:id/tasks
  └── GET /api/opportunities/:id/notes
```

---

### 2.2 Account Detail Page (Customer View)
**Status:** Basic view exists
**Priority:** CRITICAL
**Architecture Role:** Shows ALL Opportunities (projects) for this customer

**Missing:**
- [ ] **Opportunities Hub List** - All projects for this customer with status indicators
- [ ] **Contact List** - All contacts with roles, quick actions (call, email, SMS)
- [ ] **Financial Summary** - Aggregate totals across all Opportunities:
  - Total contract value
  - Total invoiced
  - Total paid
  - Balance due (sum of all open invoices)
- [ ] **Project Timeline** - Visual timeline of all Opportunities with key milestones
- [ ] **Document Repository** - All documents across all projects
- [ ] **Activity History** - Aggregate activity from all related Opportunities
- [ ] **Quick Actions** - Create New Opportunity, Add Contact, Schedule Appointment

**Relationship to Hub:**
```
Account
  └── Opportunities[] (multiple projects/jobs)
        ├── Opportunity 1 (Roof - 2024)
        │     └── [All hub data]
        ├── Opportunity 2 (Siding - 2025)
        │     └── [All hub data]
        └── Opportunity 3 (Windows - 2025)
              └── [All hub data]
```

---

### 2.3 Calendar/Scheduling View
**Status:** Basic Schedule page exists
**Priority:** CRITICAL

**Missing:**
- [ ] Gantt chart for dispatchers
- [ ] Drag-and-drop appointment rescheduling
- [ ] Resource utilization view
- [ ] Map view with appointment locations
- [ ] Conflict highlighting
- [ ] Crew workload balancing view
- [ ] Multi-day/week/month views

---

### 2.4 Commission Dashboard
**Status:** Admin page exists, rep view missing
**Priority:** HIGH

**Missing:**
- [ ] Sales rep commission summary
- [ ] Commission by period view
- [ ] Pending vs Paid breakdown
- [ ] Commission history
- [ ] Payroll period exports
- [ ] Commission disputes/adjustments UI

---

### 2.5 Quote Builder
**Status:** NOT IMPLEMENTED
**Priority:** HIGH

**Missing:**
- [ ] Visual quote builder with line items
- [ ] Product search and selection
- [ ] Price calculation with discounts
- [ ] Tax calculation
- [ ] Quote PDF preview
- [ ] Send for e-signature integration
- [ ] Quote templates
- [ ] Quote comparison view

---

### 2.6 Lead Conversion Wizard
**Status:** NOT IMPLEMENTED
**Priority:** HIGH

**Missing:**
- [ ] Convert Lead to Account + Contact + Opportunity
- [ ] Duplicate detection during conversion
- [ ] Data mapping preview
- [ ] Post-conversion redirect

---

### 2.7 Invoice Management
**Status:** Basic list view
**Priority:** HIGH

**Missing:**
- [ ] Invoice detail page
- [ ] Payment recording UI
- [ ] Send invoice to customer
- [ ] Payment plan creation
- [ ] Late fee application
- [ ] Credit memo creation
- [ ] Invoice PDF view/download

---

### 2.8 Work Order Management
**Status:** Basic CRUD
**Priority:** HIGH

**Missing:**
- [ ] Work order detail page with appointments
- [ ] Status progression workflow
- [ ] Crew assignment interface
- [ ] Material/parts tracking
- [ ] Completion checklist
- [ ] Customer signature capture
- [ ] Photo documentation

---

### 2.9 Case Management
**Status:** Schema exists, no UI
**Priority:** MEDIUM

**Missing:**
- [ ] Case list page
- [ ] Case detail page
- [ ] Case creation form
- [ ] Case assignment
- [ ] Case status workflow
- [ ] Case response templates
- [ ] Case escalation rules
- [ ] SLA tracking

---

### 2.10 Global Search
**Status:** NOT IMPLEMENTED
**Priority:** HIGH

**Missing:**
- [ ] Search bar in header
- [ ] Search results page
- [ ] Search filtering by object type
- [ ] Recent searches
- [ ] Search suggestions

---

### 2.11 Mobile Responsiveness
**Status:** Partial
**Priority:** MEDIUM

**Missing:**
- [ ] Mobile-optimized list views
- [ ] Touch-friendly interactions
- [ ] Offline capability
- [ ] Camera integration for photos
- [ ] GPS for appointment check-in

---

### 2.12 Reporting & Analytics
**Status:** Reports page exists with placeholder data
**Priority:** HIGH

**Missing:**
- [ ] Connect to real data (API deployed but not connected)
- [ ] Report builder UI
- [ ] Custom report creation
- [ ] Report scheduling
- [ ] Report export (CSV, PDF)
- [ ] Dashboard customization
- [ ] Widget library

---

### 2.13 User Preferences
**Status:** Basic settings page
**Priority:** LOW

**Missing:**
- [ ] Notification preferences
- [ ] Email signature
- [ ] Default views/filters
- [ ] Timezone settings
- [ ] Language preferences

---

## 3. Integration Gaps

### 3.1 QuickBooks Integration
**Status:** Documented, partially implemented
**Priority:** CRITICAL

**Missing:**
- [ ] Customer sync (Account → QB Customer)
- [ ] Invoice sync (Invoice → QB Invoice)
- [ ] Payment sync (Payment → QB Payment)
- [ ] Bill sync (if using Bills)
- [ ] Webhook handling for QB updates
- [ ] Sync status UI
- [ ] Error handling/retry logic

**Current State:**
- QB credentials in secrets
- QB Product IDs mapped
- No active sync implementation

---

### 3.2 Twilio/SMS Integration
**Status:** Riley SMS exists for Salesforce
**Priority:** CRITICAL

**Missing:**
- [ ] Twilio webhook endpoint in Panda CRM
- [ ] Inbound SMS handling
- [ ] Outbound SMS from CRM
- [ ] Conversation threading
- [ ] Opt-out management
- [ ] Message templates

**Current State:**
- Riley SMS integrated with Salesforce
- Needs migration to Panda CRM backend

---

### 3.3 CompanyCam Integration
**Status:** Schema exists, API not connected
**Priority:** HIGH

**Missing:**
- [ ] OAuth connection to CompanyCam
- [ ] Project sync (Opportunity → CC Project)
- [ ] Photo sync (CC Photos → Gallery)
- [ ] Webhook for new photos
- [ ] Photo viewer in Opportunity detail

---

### 3.4 Google Calendar Sync
**Status:** Schema has fields, sync not implemented
**Priority:** HIGH

**Missing:**
- [ ] OAuth flow for Google
- [ ] Calendar event creation from ServiceAppointment
- [ ] 2-way sync (changes in Google → Panda)
- [ ] Per-user calendar connection
- [ ] Conflict detection

---

### 3.5 Adobe Sign / PandaSign
**Status:** PandaSign built, migration needed
**Priority:** MEDIUM

**Missing:**
- [ ] Migrate existing Adobe Sign agreements (metadata)
- [ ] PDF access for historical agreements
- [ ] PandaSign production deployment
- [ ] Template migration

---

### 3.6 RingCentral Call Center
**Status:** COMPLETE
**Priority:** MEDIUM

**Implemented:**
- [x] Click-to-dial (RingOut) integration
- [x] Screen pop on inbound calls
- [x] Call logging to Panda CRM
- [x] Call recording links
- [x] SMS messaging
- [x] Webhook subscriptions for real-time events
- [x] Call transcription support

**Note:** Replaced Five9 with RingCentral integration (Dec 2025)

---

### 3.7 EagleView/GAF
**Status:** NOT STARTED
**Priority:** LOW

**Missing:**
- [ ] Measurement order submission
- [ ] Results sync to Opportunity
- [ ] GAF certification validation

---

### 3.8 ABC Supply
**Status:** Salesforce integration exists
**Priority:** MEDIUM

**Missing:**
- [ ] Order submission from Panda CRM
- [ ] Order status webhooks
- [ ] Product catalog sync

---

## 4. Automation/Workflow Gaps

### 4.1 Lead Assignment Rules
**Status:** NOT IMPLEMENTED
**Priority:** CRITICAL

**Missing:**
- [ ] Round-robin assignment
- [ ] Territory-based assignment
- [ ] Capacity-based assignment
- [ ] Lead source routing
- [ ] Assignment notification

---

### 4.2 Opportunity Stage Automation
**Status:** NOT IMPLEMENTED
**Priority:** HIGH

**Missing:**
- [ ] Auto-advance based on criteria
- [ ] Required fields per stage
- [ ] Stage change notifications
- [ ] Probability auto-calculation
- [ ] Close date updates

---

### 4.3 Approval Workflows
**Status:** NOT IMPLEMENTED
**Priority:** HIGH

**Missing:**
- [ ] Discount approval workflow
- [ ] Commission adjustment approval
- [ ] Quote approval
- [ ] Order approval

---

### 4.4 Email Automation
**Status:** Campaign system exists
**Priority:** MEDIUM

**Missing:**
- [ ] Welcome email on Lead creation
- [ ] Appointment reminder emails
- [ ] Invoice due reminders
- [ ] Review request emails
- [ ] Project completion emails

---

### 4.5 SMS Automation
**Status:** Campaign system exists
**Priority:** MEDIUM

**Missing:**
- [ ] Appointment reminders (1 day before)
- [ ] Crew introduction messages
- [ ] Project status updates
- [ ] Review requests

---

### 4.6 Escalation Rules
**Status:** NOT IMPLEMENTED
**Priority:** LOW

**Missing:**
- [ ] Case escalation based on age
- [ ] Lead follow-up reminders
- [ ] Overdue task escalation

---

## 5. Priority Implementation Roadmap

### Architecture-First Approach
**Build the Opportunity Hub first, then extend outward.** This ensures all features work together cohesively.

### Phase 1: Hub Foundation (Weeks 1-4)
Must complete before any migration:

1. **Opportunity Hub API Endpoints** (3 days) ⭐ START HERE
   - `/api/opportunities/:id/summary`
   - `/api/opportunities/:id/workorders`
   - `/api/opportunities/:id/appointments`
   - `/api/opportunities/:id/quotes`
   - `/api/opportunities/:id/contracts`
   - All endpoints return Opportunity context

2. **Opportunity Detail Page (THE HUB)** (1 week)
   - Hub overview section
   - Tabbed interface for related records
   - Activity timeline component
   - Quick actions bar
   - This becomes the primary user interface

3. **Deploy Reports Service** (2 days)
   - Dockerfile, ECS task, ALB rules
   - Reports should be Opportunity-centric

4. **Commission Calculation Engine** (1 week)
   - Triggers on ServiceContract (linked to Opportunity)
   - Hierarchy calculations
   - Display in Opportunity hub

5. **Lead Assignment Rules** (3 days)
   - Round-robin assignment
   - Leads convert to Accounts + Opportunities

6. **QuickBooks Integration** (1 week)
   - Invoice sync (linked via Opportunity → ServiceContract)
   - Payment sync

7. **Twilio SMS Integration** (1 week)
   - Messages linked to Contact → Opportunity
   - Opt-out handling

### Phase 2: Hub Extensions (Weeks 5-8)
Extend the hub with scheduling, quotes, and external integrations:

8. **Calendar/Scheduling View** (1 week)
   - ServiceAppointments linked via WorkOrder → Opportunity
   - Crew assignments visible in Opportunity hub

9. **Quote Builder** (1 week)
   - Quotes created from Opportunity hub
   - Product selection, pricing, discounts
   - Quote → ServiceContract flow

10. **Invoice Management UI** (1 week)
    - Invoices visible in Opportunity hub
    - Payment recording, balance tracking

11. **Lead Conversion Wizard** (3 days)
    - Lead → Account + Contact + Opportunity
    - Creates the hub structure on conversion

12. **Global Search** (1 week)
    - Search results link to Opportunity hub
    - Quick navigation to any project

13. **CompanyCam Integration** (3 days)
    - Photos linked to Opportunity
    - Displayed in hub Photos tab

14. **Google Calendar Sync** (1 week)
    - ServiceAppointments sync to calendar
    - 2-way sync maintains hub integrity

### Phase 3: Supporting Features (Weeks 9-12)
Complete the ecosystem around the hub:

15. **Work Order Management** (1 week)
    - WorkOrders as children of Opportunity
    - Crew assignment, status tracking

16. **Case Management** (1 week)
    - Cases linked via Account → Opportunity
    - Customer service visible in hub

17. **Email Service** (1 week)
    - Emails linked to Contact → Opportunity
    - Activity timeline integration

18. **Notification Service** (3 days)
    - Notifications for hub changes
    - Stage change alerts

19. **Document Generation** (1 week)
    - PDFs from Opportunity data
    - Contracts, quotes, invoices

20. **Approval Workflows** (1 week)
    - Approvals tracked in Opportunity hub
    - Discount, commission approvals

### Phase 4: Polish & Enhancements (Post-Migration)

21. **RingCentral Integration** - Call logging to Opportunity hub (COMPLETE)
22. **EagleView/GAF Integration** - Measurements linked to Opportunity
23. **Advanced Scheduling Engine** - Optimization with hub awareness
24. **Mobile App** - Opportunity hub on mobile devices

---

## 6. Technical Debt to Address

| Item | Description | Effort |
|------|-------------|--------|
| Add Event model | Calendar events missing from schema | 2 hours |
| Add EmailMessage model | Email tracking missing | 2 hours |
| Add Call model | Call logging missing | 2 hours |
| Deploy reports service | Code exists, needs deployment | 4 hours |
| Add full-text search | PostgreSQL FTS or Elasticsearch | 1 week |
| WebSocket setup | Real-time updates | 2 days |
| File upload to S3 | Current implementation incomplete | 2 days |
| Error handling standardization | Inconsistent error responses | 3 days |
| API documentation | Swagger/OpenAPI docs | 1 week |
| Unit test coverage | Currently minimal | 2 weeks |

---

## 7. Dependencies & Blockers

### External Dependencies
- QuickBooks API access and credentials
- Twilio account configuration
- CompanyCam API key
- Google Cloud project for OAuth
- AWS services (S3, SES)

### Internal Blockers
- Reports service must be deployed before dashboards work
- Commission engine required before financial migration
- SMS integration required before lead notifications
- Search service needed for usable global navigation

---

## 8. Resource Estimates

### Backend Development
- **Critical gaps:** 4 weeks full-time
- **High priority gaps:** 4 weeks full-time
- **Medium priority gaps:** 4 weeks full-time
- **Total:** 12 weeks (3 months)

### Frontend Development
- **Critical gaps:** 3 weeks full-time
- **High priority gaps:** 4 weeks full-time
- **Medium priority gaps:** 3 weeks full-time
- **Total:** 10 weeks (2.5 months)

### DevOps/Infrastructure
- **Service deployment:** 1 week
- **Integration setup:** 1 week
- **Monitoring/logging:** 1 week
- **Total:** 3 weeks

### Combined Timeline (Parallel Work)
- **Pre-migration completion:** 8-10 weeks
- **With 2 developers:** 4-5 weeks
- **With 3 developers:** 3-4 weeks

---

*Document Version: 1.0*
*Created: December 19, 2025*
*Last Updated: December 19, 2025*
