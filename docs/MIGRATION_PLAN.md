# Salesforce to Panda CRM Migration Plan

## Executive Summary

This document outlines the complete strategy for **migrating from Salesforce to Panda CRM and shutting down Salesforce**. The migration involves approximately **1.5 million records** across 50+ objects, with critical business relationships that must be preserved.

### Goal: Complete Salesforce Sunset
- **Source:** Salesforce Production (bamboo-production)
- **Target:** Panda CRM (PostgreSQL via Prisma)
- **Outcome:** Salesforce license cancellation and full operation on Panda CRM

### Current Salesforce Costs (to be eliminated)
| Item | Monthly Cost | Annual Cost |
|------|-------------|-------------|
| Salesforce Licenses (~50 users) | ~$7,500 | ~$90,000 |
| Field Service Lightning | ~$2,500 | ~$30,000 |
| FinancialForce | ~$1,500 | ~$18,000 |
| Adobe Sign | ~$500 | ~$6,000 |
| Mogli SMS | ~$300 | ~$3,600 |
| **Total** | **~$12,300** | **~$147,600** |

### Panda CRM Replacement Costs
| Item | Monthly Cost | Annual Cost |
|------|-------------|-------------|
| AWS Infrastructure (ECS, RDS, etc.) | ~$500 | ~$6,000 |
| Cognito (auth) | ~$50 | ~$600 |
| Twilio (Riley SMS - existing) | ~$200 | ~$2,400 |
| **Total** | **~$750** | **~$9,000** |

### **Annual Savings: ~$138,600**

---

## Data Volume Summary

| Category | Object | Salesforce Count | Priority |
|----------|--------|------------------|----------|
| **Core CRM** | Account | 49,417 | P1 |
| | Contact | 46,718 | P1 |
| | Lead | 11,460 | P1 |
| | Opportunity | 49,340 | P1 |
| | User | 232 | P1 |
| **Field Service** | WorkOrder | 63,271 | P2 |
| | ServiceAppointment | 72,712 | P2 |
| | ServiceResource | 214 | P2 |
| **Sales** | Quote | 21,873 | P2 |
| | ServiceContract | 12,775 | P2 |
| | Order | 3,369 | P2 |
| | Product2 | 28,179 | P2 |
| **Financial** | fw1__Invoice__c | 12,898 | P2 |
| | Commission__c | 50,107 | P2 |
| | Bill__c | 8,324 | P3 |
| **Activity** | Task | 204,417 | P3 |
| | Event | 26,997 | P3 |
| | Case | 5,093 | P3 |
| **Documents** | echosign Agreements | 6,899 | P3 |
| | ContentDocument | 96 | P3 |
| **Chatter** | FeedItem | 999,091 | P4 |

**Total: ~1.5 million records**

---

## Architecture: Opportunity Hub Model

Panda Exteriors uses **Opportunity as the central hub** for all project data. This architecture MUST be preserved in migration.

```
                              ┌─────────────────┐
                              │   OPPORTUNITY   │
                              │   (Project Hub) │
                              └────────┬────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │              │               │               │              │
        ▼              ▼               ▼               ▼              ▼
   ┌─────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐
   │ Account │   │ Contact  │   │ WorkOrder │   │  Quote   │   │Commission│
   │(Customer)│   │(Primary) │   │           │   │          │   │          │
   └─────────┘   └──────────┘   └─────┬─────┘   └────┬─────┘   └──────────┘
                                      │              │
                                      ▼              ▼
                              ┌───────────────┐ ┌────────────┐
                              │ServiceAppoint-│ │  Service   │
                              │    ment       │ │  Contract  │
                              └───────┬───────┘ └────────────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │   Assigned    │
                              │   Resource    │
                              └───────────────┘
```

---

## Phase 1: Foundation (Core CRM)

### 1.1 Users (Priority: CRITICAL)

**Source:** User (232 records)
**Target:** User table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Store for reference |
| Email | email | Primary identifier |
| FirstName | firstName | |
| LastName | lastName | |
| Name | fullName | Computed or stored |
| Phone | phone | |
| MobilePhone | mobilePhone | |
| IsActive | isActive | |
| Department | department | |
| Division | division | |
| Title | title | |
| EmployeeNumber | employeeNumber | |
| UserRole.Name | → Role lookup | Map to roles |
| ManagerId | managerId | Self-referential |
| Regional_Manager__c | regionalManagerId | Custom hierarchy |
| Director__c | directorId | Custom hierarchy |
| Executive__c | executiveId | Custom hierarchy |
| Company_Lead_Rate__c | companyLeadRate | Commission rate |
| Pre_Commission_Rate__c | preCommissionRate | Commission rate |
| SelfGen_Rate__c | selfGenRate | Commission rate |
| Override_Percent__c | overridePercent | Override commission |

**Migration Script:** `scripts/migration/01-users.js`

```javascript
// Pseudo-code for user migration
const migrateUsers = async () => {
  // 1. Fetch all active users from Salesforce
  const sfUsers = await sf.query(`
    SELECT Id, Email, FirstName, LastName, Name, Phone, MobilePhone,
           IsActive, Department, Division, Title, EmployeeNumber,
           UserRole.Name, ManagerId, Regional_Manager__c, Director__c,
           Executive__c, Company_Lead_Rate__c, Pre_Commission_Rate__c,
           SelfGen_Rate__c, Override_Percent__c
    FROM User
    WHERE IsActive = true
  `);

  // 2. Create roles if they don't exist
  const roles = [...new Set(sfUsers.map(u => u.UserRole?.Name))];
  await prisma.role.createMany({ data: roles.map(name => ({ name })) });

  // 3. First pass: Create users without manager references
  for (const sfUser of sfUsers) {
    await prisma.user.create({
      data: {
        salesforceId: sfUser.Id,
        email: sfUser.Email,
        firstName: sfUser.FirstName,
        lastName: sfUser.LastName,
        // ... other fields
      }
    });
  }

  // 4. Second pass: Update manager references
  for (const sfUser of sfUsers) {
    if (sfUser.ManagerId) {
      const manager = await prisma.user.findFirst({
        where: { salesforceId: sfUser.ManagerId }
      });
      await prisma.user.update({
        where: { salesforceId: sfUser.Id },
        data: { managerId: manager?.id }
      });
    }
  }
};
```

---

### 1.2 Accounts (Priority: CRITICAL)

**Source:** Account (49,417 records)
**Target:** Account table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| Name | name | Required |
| Type | type | Picklist |
| Account_Status__c | status | Custom field |
| BillingStreet | billingStreet | |
| BillingCity | billingCity | |
| BillingState | billingState | |
| BillingPostalCode | billingPostalCode | |
| Phone | phone | |
| Website | website | |
| OwnerId | ownerId | Map via salesforceId |
| isPandaClaims__c | isPandaClaims | Boolean |
| isSureClaims__c | isSureClaims | Boolean |
| Total_Sales_Volume__c | totalSalesVolume | Decimal |
| fw1__Total_Paid_Amount__c | totalPaidAmount | From FinancialForce |
| Balance_Due__c | balanceDue | Computed or stored |
| QB_Customer_ID__c | qbCustomerId | QuickBooks integration |

**Key Considerations:**
- Map OwnerId to User via salesforceId lookup
- Preserve all custom financial fields
- Handle QB integration IDs

---

### 1.3 Contacts (Priority: CRITICAL)

**Source:** Contact (46,718 records)
**Target:** Contact table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| AccountId | accountId | Map via Account.salesforceId |
| FirstName | firstName | |
| LastName | lastName | |
| Name | fullName | |
| Email | email | |
| Phone | phone | |
| MobilePhone | mobilePhone | |
| Mogli_SMS__Mogli_Number__c | smsNumber | E.164 format |
| Riley_Number__c | smsNumber | Preferred source |
| Mogli_SMS__Mogli_Opt_Out__c | smsOptOut | Boolean |
| Riley_Opt_Out__c | smsOptOut | Preferred source |
| HasOptedOutOfEmail | emailOptOut | |
| DoNotCall | doNotCall | |
| MailingStreet | mailingStreet | |
| MailingCity | mailingCity | |
| MailingState | mailingState | |
| MailingPostalCode | mailingPostalCode | |

**Key Considerations:**
- Riley fields take precedence over Mogli fields
- smsNumber must be in E.164 format (+1XXXXXXXXXX)
- Preserve opt-out status carefully (legal requirement)

---

### 1.4 Leads (Priority: CRITICAL)

**Source:** Lead (11,460 records)
**Target:** Lead table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| FirstName | firstName | |
| LastName | lastName | |
| Name | fullName | |
| Company | company | |
| Email | email | |
| Phone | phone | |
| MobilePhone | mobilePhone | |
| Status | status | Map values |
| LeadSource | source | |
| Rating | rating | |
| OwnerId | ownerId | Map via User |
| IsConverted | isConverted | Boolean |
| ConvertedDate | convertedDate | |
| ConvertedAccountId | convertedAccountId | Map via Account |
| ConvertedContactId | convertedContactId | Map via Contact |
| ConvertedOpportunityId | convertedOpportunityId | Map via Opportunity |
| SelfGen_Lead__c | isSelfGen | Boolean |
| Mogli_SMS__Mogli_Number__c | smsNumber | SMS phone |

**Key Considerations:**
- Preserve conversion relationships
- Map lead sources to new system values
- Handle self-gen tracking

---

### 1.5 Opportunities (Priority: CRITICAL)

**Source:** Opportunity (49,340 records)
**Target:** Opportunity table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| Name | name | |
| AccountId | accountId | Map via Account |
| ContactId | contactId | Map via Contact |
| OwnerId | ownerId | Map via User |
| StageName | stage | Map stage values |
| Status__c | status | Custom status |
| Amount | amount | Decimal |
| CloseDate | closeDate | |
| Probability | probability | Integer |
| Type | type | Insurance/Retail/Commercial |
| Work_Type__c | workType | Roofing/Siding/etc |
| isPandaClaims__c | isPandaClaims | Boolean |
| isApproved__c | isApproved | Boolean |
| Claim_Number__c | claimNumber | |
| Insurance_Company__c | insuranceCarrier | |
| RCV_Amount__c | rcvAmount | Decimal |
| ACV_Amount__c | acvAmount | Decimal |
| Deductible__c | deductible | Decimal |
| Appointment_Date__c | appointmentDate | DateTime |
| Sold_Date__c | soldDate | |
| Contract_Total__c | contractTotal | Decimal |
| SelfGen_Lead__c | isSelfGen | Boolean |

**Stage Mapping:**
```javascript
const stageMapping = {
  'Lead Unassigned': 'LEAD_UNASSIGNED',
  'Lead Assigned': 'LEAD_ASSIGNED',
  'Scheduled': 'SCHEDULED',
  'Inspected': 'INSPECTED',
  'Claim Filed': 'CLAIM_FILED',
  'Approved': 'APPROVED',
  'Contract Signed': 'CONTRACT_SIGNED',
  'In Production': 'IN_PRODUCTION',
  'Completed': 'COMPLETED',
  'Closed Won': 'CLOSED_WON',
  'Closed Lost': 'CLOSED_LOST',
};
```

---

## Phase 2: Field Service

### 2.1 ServiceResources (Crews)

**Source:** ServiceResource (214 records)
**Target:** ServiceResource table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| Name | name | |
| ResourceType | resourceType | T/C/D/A |
| IsActive | isActive | |
| RelatedRecordId | userId | Map if User |

---

### 2.2 WorkOrders

**Source:** WorkOrder (63,271 records)
**Target:** WorkOrder table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| WorkOrderNumber | workOrderNumber | |
| Opportunity__c | opportunityId | CRITICAL - Custom lookup |
| AccountId | accountId | |
| Subject | subject | |
| Description | description | |
| Status | status | Map values |
| Priority | priority | |
| WorkTypeId | workTypeId | Map to WorkType |
| ServiceTerritoryId | serviceTerritoryId | Map to ServiceTerritory |

**Key Considerations:**
- Opportunity__c is a CUSTOM field - standard WorkOrder doesn't link to Opportunity
- This is the key Opportunity Hub relationship

---

### 2.3 ServiceAppointments

**Source:** ServiceAppointment (72,712 records)
**Target:** ServiceAppointment table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| AppointmentNumber | appointmentNumber | |
| ParentRecordId | workOrderId | Usually WorkOrder |
| Opportunity__c | → via WorkOrder | Custom lookup |
| Subject | subject | |
| Description | description | |
| Status | status | Map values |
| EarliestStartTime | earliestStart | DateTime |
| DueDate | dueDate | DateTime |
| SchedStartTime | scheduledStart | DateTime |
| SchedEndTime | scheduledEnd | DateTime |
| ActualStartTime | actualStart | DateTime |
| ActualEndTime | actualEnd | DateTime |
| Duration | duration | In minutes |
| Street | street | Address |
| City | city | |
| State | state | |
| PostalCode | postalCode | |

---

### 2.4 AssignedResources

**Source:** AssignedResource (junction table)
**Target:** AssignedResource table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| ServiceAppointmentId | serviceAppointmentId | Map via SA |
| ServiceResourceId | serviceResourceId | Map via SR |

---

## Phase 3: Sales Pipeline

### 3.1 Products

**Source:** Product2 (28,179 records)
**Target:** Product table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| Name | name | |
| ProductCode | productCode | |
| Description | description | |
| Family | family | Category |
| IsActive | isActive | |
| ProductId__c | qbProductId | QuickBooks ID |

---

### 3.2 Quotes

**Source:** Quote (21,873 records)
**Target:** Quote table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| QuoteNumber | quoteNumber | |
| Name | name | |
| OpportunityId | opportunityId | Map via Opportunity |
| Status | status | Map values |
| ExpirationDate | expirationDate | |
| Subtotal | subtotal | |
| Discount | discount | |
| Tax | tax | |
| TotalPrice | total | |
| PM_Quote__c | isPmQuote | Boolean |
| Pricebook2Id | pricebookId | Map via Pricebook |

---

### 3.3 ServiceContracts

**Source:** ServiceContract (12,775 records)
**Target:** ServiceContract table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| ContractNumber | contractNumber | |
| Name | name | |
| Opportunity__c | opportunityId | CRITICAL - Custom lookup |
| Quote__c | quoteId | Map via Quote |
| Status | status | |
| StartDate | startDate | |
| EndDate | endDate | |
| Contract_Grand_Total__c | contractTotal | Decimal |
| Collected_Percent__c | collectedPercent | |
| Paid_Amount__c | paidAmount | |
| Balance_Due__c | balanceDue | |
| Pre_Commission_Rate__c | preCommissionRate | |
| Company_Lead_Rate__c | companyLeadRate | |
| Self_Gen_Rate__c | selfGenRate | |
| PM_Contract__c | isPmContract | Boolean |
| Back_End_Commission_Ready__c | backEndCommissionReady | Boolean |
| Manager__c | managerId | Map via User |
| Regional_Manager__c | regionalManagerId | Map via User |
| Director__c | directorId | Map via User |
| Executive__c | executiveId | Map via User |

---

### 3.4 Commissions

**Source:** Commission__c (50,107 records)
**Target:** Commission table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| Name | name | Auto-generated |
| Commission_Type__c | type | Map enum |
| Status__c | status | Map enum |
| Commission_Value__c | commissionValue | Base value |
| Commission_Rate_of_Pay__c | commissionRate | Percentage |
| Commission_Amount__c | commissionAmount | Calculated |
| Requested_Amount__c | requestedAmount | |
| Pre_Commission_Amount__c | preCommissionAmount | |
| Paid_Amount__c | paidAmount | |
| OwnerId | ownerId | Map via User |
| Service_Contract__c | serviceContractId | Map via ServiceContract |
| Invoice__c | invoiceId | Map via Invoice |
| Customer_Name__c | → via ServiceContract | Derived |
| is_Company_Lead__c | isCompanyLead | Boolean |
| is_SelfGen__c | isSelfGen | Boolean |
| Notes__c | notes | |
| Hold_Reason__c | holdReason | |
| Denied_Reason__c | deniedReason | |

---

### 3.5 Invoices (FinancialForce)

**Source:** fw1__Invoice__c (12,898 records)
**Target:** Invoice table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| Name | invoiceNumber | |
| fw1__Status__c | status | Map values |
| fw1__Invoice_Date__c | invoiceDate | |
| fw1__Due_Date__c | dueDate | |
| fw1__Terms__c | terms | Days |
| fw1__Subtotal__c | subtotal | |
| fw1__Tax__c | tax | |
| fw1__Total__c | total | |
| fw1__Amount_Paid__c | amountPaid | |
| fw1__Balance__c | balanceDue | |
| fw1__Account__c | accountId | Map via Account |
| QB_Invoice_ID__c | qbInvoiceId | QuickBooks |
| Stripe_Invoice_Id__c | stripeInvoiceId | Stripe |

**Note:** FinancialForce is a managed package. Consider:
1. Export all invoice data before migration
2. Keep FinancialForce in Salesforce for historical reference
3. New invoices created in Panda CRM going forward

---

## Phase 4: Activity & History

### 4.1 Tasks

**Source:** Task (204,417 records)
**Target:** Task table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| Subject | subject | |
| Description | description | |
| Status | status | Map values |
| Priority | priority | Map values |
| ActivityDate | dueDate | |
| CompletedDateTime | completedDate | |
| OwnerId | assignedToId | Map via User |
| WhatId | opportunityId or leadId | Polymorphic |
| WhoId | contactId | |

**Polymorphic WhatId Handling:**
```javascript
// Determine related record type from WhatId prefix
const getRelatedRecord = (whatId) => {
  if (!whatId) return { type: null, id: null };

  const prefix = whatId.substring(0, 3);
  switch (prefix) {
    case '006': return { type: 'Opportunity', id: whatId };
    case '00Q': return { type: 'Lead', id: whatId };
    case '001': return { type: 'Account', id: whatId };
    default: return { type: 'Unknown', id: whatId };
  }
};
```

---

### 4.2 Events (Calendar)

**Source:** Event (26,997 records)
**Target:** Need to add Event model to schema

**Recommendation:** Add Event model:
```prisma
model Event {
  id            String    @id @default(cuid())
  salesforceId  String?   @unique
  subject       String
  description   String?
  startDateTime DateTime
  endDateTime   DateTime
  isAllDay      Boolean   @default(false)
  location      String?
  ownerId       String
  owner         User      @relation(fields: [ownerId], references: [id])
  accountId     String?
  account       Account?  @relation(fields: [accountId], references: [id])
  contactId     String?
  contact       Contact?  @relation(fields: [contactId], references: [id])
  opportunityId String?
  opportunity   Opportunity? @relation(fields: [opportunityId], references: [id])
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

---

### 4.3 Cases

**Source:** Case (5,093 records)
**Target:** Case table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| CaseNumber | caseNumber | |
| Subject | subject | |
| Description | description | |
| Status | status | Map values |
| Priority | priority | |
| Type | type | |
| AccountId | accountId | Map via Account |
| ContactId | contactId | Map via Contact |
| OwnerId | ownerId | Map via User |

---

### 4.4 Chatter (FeedItems)

**Source:** FeedItem (999,091 records)
**Target:** Note table (repurposed) or new ChatterPost table

**Strategy Options:**

1. **Option A: Migrate as Notes**
   - Convert Chatter posts to Notes
   - Lose threading/comments structure
   - Simpler implementation

2. **Option B: Create ChatterPost model**
   - Preserve full conversation structure
   - More complex but more accurate
   - ~1 million records is significant

3. **Option C: Archive only**
   - Export to read-only archive
   - Don't migrate to transactional database
   - Query Salesforce for historical data

**Recommendation:** Option C for initial migration, Option B for future enhancement.

---

## Phase 5: Documents & E-Signatures

### 5.1 Adobe Sign Agreements

**Source:** echosign_dev1__SIGN_Agreement__c (6,899 records)
**Target:** Agreement table

| Salesforce Field | Panda CRM Field | Notes |
|-----------------|-----------------|-------|
| Id | salesforceId | Reference |
| Name | name | |
| echosign_dev1__Status__c | status | |
| echosign_dev1__Agreement_Type__c | type | |
| echosign_dev1__Date_Sent__c | sentDate | |
| echosign_dev1__Date_Signed__c | signedDate | |
| echosign_dev1__Document_Key__c | externalId | Adobe Sign ID |
| echosign_dev1__Account__c | accountId | Map via Account |
| echosign_dev1__Opportunity__c | opportunityId | Map via Opportunity |

**Considerations:**
- Adobe Sign stores actual documents in their cloud
- Need API access to download PDFs
- Legal retention requirements (7+ years)
- May need to keep Adobe Sign active for historical access

---

### 5.2 ContentDocuments (Files)

**Source:** ContentDocument + ContentVersion (96 files)
**Target:** File table + S3 storage

**Migration Process:**
1. Query ContentDocumentLink for related records
2. Download file content via ContentVersion.VersionData
3. Upload to S3 bucket (panda-crm-files)
4. Create File record with S3 URL

---

### 5.3 CompanyCam Photos

**Source:** CompanyCam API (external)
**Target:** CompanyCamPhoto table + Gallery table

**Note:** CompanyCam is an external system. Integration approach:
1. Use CompanyCam API to fetch project photos
2. Link photos to Opportunities via project ID mapping
3. Store photo metadata in CompanyCamPhoto table
4. Optionally copy photos to S3 for redundancy

---

## Migration Execution Plan

### Pre-Migration Checklist

- [ ] Backup Salesforce data (full export)
- [ ] Backup PostgreSQL database
- [ ] Create staging environment for testing
- [ ] Validate Prisma schema is up-to-date
- [ ] Set up migration logging table
- [ ] Create rollback procedures
- [ ] Notify users of migration window

### Execution Order

```
Week 1: Foundation
├── Day 1: Users & Roles
├── Day 2: Accounts
├── Day 3: Contacts
├── Day 4: Leads
└── Day 5: Opportunities (verify hub relationships)

Week 2: Field Service
├── Day 1: ServiceResources, ServiceTerritories, WorkTypes
├── Day 2: WorkOrders (with Opportunity links)
├── Day 3-4: ServiceAppointments
└── Day 5: AssignedResources

Week 3: Sales Pipeline
├── Day 1: Products & Pricebooks
├── Day 2: Quotes & QuoteLineItems
├── Day 3: ServiceContracts
├── Day 4: Orders & OrderLineItems
└── Day 5: Commissions

Week 4: Financial & Activity
├── Day 1: Invoices & Payments
├── Day 2-3: Tasks (204K records)
├── Day 4: Cases
└── Day 5: Events

Week 5: Documents & Validation
├── Day 1: Adobe Sign Agreements (metadata)
├── Day 2: ContentDocuments (files to S3)
├── Day 3: CompanyCam integration
├── Day 4-5: Data validation & reconciliation
```

### Post-Migration Validation

```javascript
// Validation queries to run after each phase
const validationChecks = {
  accounts: `
    SELECT
      (SELECT COUNT(*) FROM Account) as sf_count,
      (SELECT COUNT(*) FROM "Account") as pg_count
  `,
  opportunities: `
    -- Verify Opportunity Hub relationships
    SELECT o.Id, o.Name,
      (SELECT COUNT(*) FROM WorkOrder WHERE Opportunity__c = o.Id) as workorders,
      (SELECT COUNT(*) FROM Quote WHERE OpportunityId = o.Id) as quotes,
      (SELECT COUNT(*) FROM ServiceContract WHERE Opportunity__c = o.Id) as contracts
    FROM Opportunity o
    LIMIT 100
  `,
  // ... more checks
};
```

---

## Migration Scripts Location

```
/Users/robwinters/panda-crm/scripts/migration/
├── 00-setup.js              # Database prep, logging setup
├── 01-users.js              # Users & Roles
├── 02-accounts.js           # Accounts
├── 03-contacts.js           # Contacts
├── 04-leads.js              # Leads
├── 05-opportunities.js      # Opportunities
├── 06-field-service.js      # WorkOrders, ServiceAppointments, Resources
├── 07-quotes.js             # Quotes & LineItems
├── 08-contracts.js          # ServiceContracts
├── 09-commissions.js        # Commissions
├── 10-invoices.js           # Invoices & Payments
├── 11-tasks.js              # Tasks
├── 12-events.js             # Events
├── 13-cases.js              # Cases
├── 14-documents.js          # Files & Agreements
├── 99-validate.js           # Validation & reconciliation
└── utils/
    ├── salesforce.js        # SF connection & queries
    ├── mapping.js           # Field mappings & transformations
    ├── logger.js            # Migration logging
    └── rollback.js          # Rollback procedures
```

---

## Integration Considerations

### QuickBooks
- Preserve QB Customer IDs (qbCustomerId)
- Preserve QB Invoice IDs (qbInvoiceId)
- Update integration to use Panda CRM as source

### Stripe
- Preserve Stripe Customer IDs (stripeCustomerId)
- Preserve Stripe Invoice IDs (stripeInvoiceId)
- Update webhook endpoints

### Twilio/Riley SMS
- smsNumber field must be E.164 format
- Preserve opt-out status
- Update API endpoints for message delivery

### CompanyCam
- Map CompanyCam project IDs to Opportunities
- Set up webhook for new photos
- Sync existing project photos

### Google Calendar
- Preserve calendar event IDs where synced
- Update OAuth credentials
- Re-establish calendar sync per user

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Full Salesforce backup, PostgreSQL backup, incremental migration |
| Relationship integrity | Migrate in dependency order, validate after each phase |
| Commission calculation errors | Parallel run period, compare calculations |
| User access disruption | Migrate during off-hours, quick rollback procedure |
| Integration failures | Test integrations in staging first |
| Performance issues | Batch processing, index optimization |

---

## Success Criteria

1. **Data Integrity**
   - 100% of Accounts migrated with all relationships
   - 100% of Opportunities with correct hub relationships
   - All financial data balanced (invoices, payments, commissions)

2. **Functionality**
   - Users can log in and see their data
   - Opportunity hub shows all related records
   - Commission calculations match Salesforce
   - Integrations function (QB, Stripe, Twilio)

3. **Performance**
   - Dashboard loads in < 3 seconds
   - Search returns results in < 1 second
   - Reports generate in < 10 seconds

---

## Appendix A: Salesforce ID Prefixes

| Prefix | Object |
|--------|--------|
| 001 | Account |
| 003 | Contact |
| 00Q | Lead |
| 006 | Opportunity |
| 005 | User |
| 0WO | WorkOrder |
| 08p | ServiceAppointment |
| 0Hn | ServiceResource |
| 0Q0 | Quote |
| 801 | Order |
| 01t | Product2 |

---

## Appendix B: Schema Additions Required

### Event Model (Missing)
```prisma
model Event {
  id            String    @id @default(cuid())
  salesforceId  String?   @unique
  subject       String
  description   String?
  location      String?
  startDateTime DateTime
  endDateTime   DateTime
  isAllDay      Boolean   @default(false)
  ownerId       String
  owner         User      @relation("EventOwner", fields: [ownerId], references: [id])
  accountId     String?
  account       Account?  @relation(fields: [accountId], references: [id])
  contactId     String?
  contact       Contact?  @relation(fields: [contactId], references: [id])
  opportunityId String?
  opportunity   Opportunity? @relation(fields: [opportunityId], references: [id])
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

### ChatterPost Model (For Future)
```prisma
model ChatterPost {
  id            String    @id @default(cuid())
  salesforceId  String?   @unique
  body          String
  type          String    // TextPost, LinkPost, ContentPost, etc.
  parentId      String?   // For record context
  parentType    String?   // Account, Opportunity, etc.
  createdById   String
  createdBy     User      @relation(fields: [createdById], references: [id])
  comments      ChatterComment[]
  createdAt     DateTime  @default(now())
}

model ChatterComment {
  id            String    @id @default(cuid())
  salesforceId  String?   @unique
  body          String
  postId        String
  post          ChatterPost @relation(fields: [postId], references: [id])
  createdById   String
  createdBy     User      @relation(fields: [createdById], references: [id])
  createdAt     DateTime  @default(now())
}
```

---

## Appendix C: Salesforce Sunset Plan

### Phase 1: Parallel Operation (Weeks 1-4)
During migration, both systems run simultaneously.

| Task | Description | Owner |
|------|-------------|-------|
| Read-only Salesforce | Set most users to read-only after Week 2 | Admin |
| Panda CRM training | Train users on new system | Training |
| Data sync validation | Compare records between systems daily | Dev |
| Integration switchover prep | Document all integration endpoints | Dev |

### Phase 2: Cutover (Week 5)

**Cutover Day Checklist:**
- [ ] Final data sync from Salesforce → Panda CRM
- [ ] Disable Salesforce logins for standard users
- [ ] Switch integrations to Panda CRM:
  - [ ] QuickBooks webhook → Panda CRM endpoint
  - [ ] Twilio webhooks → Already on Panda CRM (Riley)
  - [ ] CompanyCam webhooks → Panda CRM endpoint
  - [ ] ABC Supply API → Panda CRM endpoint
- [ ] Update DNS/redirects:
  - [ ] Remove Salesforce SSO links
  - [ ] Update bookmarks documentation
- [ ] Verify all users can log into Panda CRM
- [ ] Run validation queries to confirm data integrity

### Phase 3: Salesforce Wind-Down (Weeks 6-8)

| Week | Action |
|------|--------|
| Week 6 | Admin-only access to Salesforce for reference |
| Week 7 | Export final backup (full org export) |
| Week 8 | Cancel Salesforce contract/reduce to minimum |

### Salesforce Components to Decommission

| Component | Replacement | Action |
|-----------|-------------|--------|
| **User Licenses** | Cognito users | Cancel all licenses |
| **Field Service Lightning** | Panda CRM scheduling | Cancel FSL add-on |
| **FinancialForce** | Panda CRM invoicing + Stripe | Cancel FinancialForce |
| **Adobe Sign** | PandaSign | Cancel Adobe Sign (keep read access for 1 year) |
| **Mogli SMS** | Riley SMS (already migrated) | Uninstall package |
| **Custom Apex/Flows** | Panda CRM backend logic | Document and archive |
| **Reports/Dashboards** | Panda CRM Reports service | Export PDFs for reference |

### Data Retention Requirements

| Data Type | Retention | Storage Location |
|-----------|-----------|------------------|
| Signed contracts | 7 years | S3 + Panda CRM |
| Financial records | 7 years | PostgreSQL + backups |
| Customer communications | 3 years | DynamoDB (Riley) |
| Historical Chatter | Archive only | S3 JSON export |
| Salesforce full export | 1 year | S3 archive bucket |

### Salesforce Contract Considerations

1. **Check renewal date** - Salesforce contracts are typically annual
2. **Provide 90-day notice** - Most contracts require advance notice
3. **Negotiate reduced seats** - If mid-contract, reduce to minimum (1-2 admin seats)
4. **Data export rights** - Ensure full export completed before cancellation
5. **API access post-cancel** - Confirm read-only API access for transition period

### Rollback Plan

If critical issues arise within first 2 weeks post-cutover:

1. **Re-enable Salesforce logins** (admin can do in 5 minutes)
2. **Switch integrations back** (documented endpoints)
3. **Sync any Panda CRM changes back** to Salesforce
4. **Identify and fix issues** before re-attempting cutover

### Success Criteria for Salesforce Shutdown

| Criteria | Metric |
|----------|--------|
| All users active on Panda CRM | 100% login rate |
| Zero business-critical data loss | Validation queries pass |
| All integrations functional | QB, Twilio, CompanyCam working |
| Commission calculations match | ±$1 variance acceptable |
| No Salesforce dependency | 30 days without Salesforce access |

---

## Appendix D: Custom Build vs. Salesforce Feature Parity

### What We're Building Custom (Panda CRM)

| Salesforce Feature | Panda CRM Replacement | Status |
|--------------------|----------------------|--------|
| Opportunity Management | Opportunity Hub | ✅ Schema done, UI partial |
| Account/Contact Management | Account/Contact services | ✅ Complete |
| Lead Management | Lead service | ✅ Complete |
| Field Service Lightning | WorkOrder/ServiceAppointment | ⚠️ Basic, needs scheduling engine |
| Salesforce Reports | Reports service | ⚠️ Code exists, not deployed |
| Dashboards | Dashboard Builder | ⚠️ UI exists, needs backend |
| FinancialForce Invoicing | Invoice service + Stripe | ⚠️ Partial |
| Commission Tracking | Commission Engine | ⚠️ Schema done, logic needed |
| Adobe Sign | PandaSign | ✅ Built, needs production deploy |
| Mogli SMS | Riley SMS | ✅ Complete and production |
| Chatter | Notes/Activity | ⚠️ Basic notes, no threading |
| Approval Workflows | Workflow Engine | ❌ Not started |
| Email Integration | Email service | ❌ Not started |

### What We're NOT Building (Third-Party)

| Salesforce Feature | Replacement | Notes |
|--------------------|-------------|-------|
| RingCentral Integration | COMPLETE | Click-to-dial, SMS, call logging, webhooks |
| EagleView/GAF | Keep as-is | Standalone integration |
| ABC Supply | Keep as-is | Already API-based |
| QuickBooks | Keep QB, new sync | QB integration already documented |
| CompanyCam | Keep as-is | Photo sync to Panda CRM |

### Feature Parity Checklist

Before Salesforce shutdown, these must work in Panda CRM:

**Sales Operations:**
- [ ] Create/edit Leads
- [ ] Convert Lead → Account + Contact + Opportunity
- [ ] Manage Opportunity pipeline stages
- [ ] Create Quotes with line items
- [ ] Send quotes for e-signature (PandaSign)
- [ ] Track commission calculations

**Field Operations:**
- [ ] Create/assign Work Orders
- [ ] Schedule Service Appointments
- [ ] Assign crews to appointments
- [ ] View daily/weekly schedule
- [ ] Mobile-friendly appointment view

**Financial Operations:**
- [ ] Create Invoices from Contracts
- [ ] Record payments
- [ ] Sync with QuickBooks
- [ ] Track balance due
- [ ] Generate financial reports

**Customer Communication:**
- [ ] Send/receive SMS (Riley)
- [ ] Log calls and emails
- [ ] View customer activity timeline
- [ ] Create follow-up tasks

**Reporting:**
- [ ] Pipeline by stage
- [ ] Revenue by period
- [ ] Commission reports
- [ ] Production schedule
- [ ] Sales rep performance

---

*Document Version: 1.1*
*Created: December 19, 2025*
*Last Updated: December 19, 2025*
