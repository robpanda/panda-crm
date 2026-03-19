import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUserLookup,
  deriveUserMappings,
  inferSheetCategory,
  normalizeInputRows,
  resetPreviewPlanRegistryForTest,
} from '../callCenterImportService.js';
import { CallCenterImportService } from '../callCenterImportService.js';

function createMockPrisma({
  users = [],
  leads = [],
  contacts = [],
  appointments = [],
  convertedOpportunity = null,
  systemSettings = null,
} = {}) {
  const createdLeads = [];
  const auditEntries = [];
  const settingsStore = systemSettings || new Map();
  const queryCounts = {
    userFindMany: 0,
    leadFindMany: 0,
    contactFindMany: 0,
    serviceAppointmentFindMany: 0,
    opportunityFindUnique: 0,
    systemSettingFindUnique: 0,
    systemSettingFindMany: 0,
    systemSettingUpsert: 0,
    systemSettingDeleteMany: 0,
  };

  const tx = {
    lead: {
      create: async ({ data }) => {
        const record = { id: `lead-created-${createdLeads.length + 1}`, ...data };
        createdLeads.push(record);
        return record;
      },
      update: async ({ where, data }) => ({ id: where.id, ...data }),
    },
    auditLog: {
      create: async ({ data }) => {
        auditEntries.push(data);
        return data;
      },
    },
  };

  return {
    user: {
      findMany: async () => {
        queryCounts.userFindMany += 1;
        return users;
      },
    },
    lead: {
      findMany: async () => {
        queryCounts.leadFindMany += 1;
        return leads;
      },
    },
    contact: {
      findMany: async () => {
        queryCounts.contactFindMany += 1;
        return contacts;
      },
    },
    serviceAppointment: {
      findMany: async () => {
        queryCounts.serviceAppointmentFindMany += 1;
        return appointments;
      },
    },
    opportunity: {
      findUnique: async () => {
        queryCounts.opportunityFindUnique += 1;
        return convertedOpportunity;
      },
    },
    systemSetting: {
      findUnique: async ({ where }) => {
        queryCounts.systemSettingFindUnique += 1;
        return settingsStore.get(where.key) || null;
      },
      findMany: async ({ where } = {}) => {
        queryCounts.systemSettingFindMany += 1;
        const rows = [...settingsStore.values()];
        if (!where?.category) return rows;
        return rows.filter((row) => row.category === where.category);
      },
      upsert: async ({ where, create, update }) => {
        queryCounts.systemSettingUpsert += 1;
        const existing = settingsStore.get(where.key);
        const nextRecord = existing
          ? {
              ...existing,
              ...update,
              key: existing.key,
            }
          : {
              id: `setting-${settingsStore.size + 1}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...create,
            };
        settingsStore.set(where.key, nextRecord);
        return nextRecord;
      },
      deleteMany: async ({ where }) => {
        queryCounts.systemSettingDeleteMany += 1;
        const keys = where?.key?.in || (where?.key ? [where.key] : []);
        let count = 0;
        for (const key of keys) {
          if (settingsStore.delete(key)) count += 1;
        }
        return { count };
      },
    },
    $transaction: async (callback) => callback(tx),
    __createdLeads: createdLeads,
    __auditEntries: auditEntries,
    __queryCounts: queryCounts,
    __systemSettings: settingsStore,
  };
}

test('normalizeInputRows derives workbook-style rows into canonical call center events', () => {
  const [row] = normalizeInputRows({
    rows: [
      {
        sourceSheet: 'Confirmation Report 317',
        sourceRowNumber: 2,
        homeownername: 'John Example',
        date: '2026-03-17',
        time: '9:30 AM',
        callcenterrep: 'Tony',
        leadcreator: 'Marcus Booker',
        assignedto: 'Chris B',
        disposition: 'Confirmed',
        additionalnotes: 'Confirmed at 8:20am. Call back at 302-555-1212 john@example.com',
      },
    ],
  });

  assert.equal(row.sourceSheet, 'Confirmation Report 317');
  assert.equal(row.sheetCategory, 'confirmation');
  assert.equal(row.eventType, 'CONFIRMATION');
  assert.equal(row.normalizedDisposition, 'CONFIRMED');
  assert.equal(row.callCenterStatus, 'CONFIRMED');
  assert.equal(row.phone, '3025551212');
  assert.equal(row.email, 'john@example.com');
  assert.equal(row.repName, 'Tony');
  assert.match(row.rowId, /^ccir_/);
});

test('previewImport flags callback rows without callback date/time and preserves canonical call-center labels', async () => {
  const service = new CallCenterImportService(createMockPrisma());

  const result = await service.previewImport({
    rows: [
      {
        sourceSheet: 'Leads',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        disposition: 'Call Back Later',
      },
    ],
  });

  assert.equal(result.rows[0].normalizedDisposition, 'CALL_BACK');
  assert.equal(result.rows[0].callCenterStatus, 'NOT_SET');
  assert.equal(result.rows[0].systemLeadStatus, 'NURTURING');
  assert.ok(result.rows[0].conflicts.some((conflict) => conflict.code === 'MISSING_CALLBACK_TIME'));
});

test('buildLeadCreateData writes canonical callback disposition without treating callbacks as tentative appointments', () => {
  const [row] = normalizeInputRows({
    rows: [
      {
        sourceSheet: 'Leads',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        time: '4:00 PM',
        disposition: 'Callback Requested',
      },
    ],
  });

  const service = new CallCenterImportService(createMockPrisma());
  const leadData = service.buildLeadCreateData(row, {
    owner: null,
    leadSetBy: null,
    ownerReportingCredits: null,
  });

  assert.equal(leadData.disposition, 'CALL_BACK');
  assert.equal(leadData.status, 'NURTURING');
  assert.equal(leadData.tentativeAppointmentDate, null);
  assert.equal(leadData.tentativeAppointmentTime, null);
  assert.ok(leadData.callback_scheduled_at instanceof Date);
  assert.equal(leadData.callback_scheduled_at.toISOString(), '2026-03-17T16:00:00.000Z');
});

test('deriveUserMappings classifies exact, alias, and low-confidence workbook rep matches', () => {
  const lookup = buildUserLookup([
    { id: 'user-owner', firstName: 'Chris', lastName: 'Barriera', fullName: 'Chris Barriera', email: 'chris@example.com' },
    { id: 'user-setter', firstName: 'Anthony', lastName: 'Valenti', fullName: 'Anthony Valenti', email: 'tony@example.com' },
  ]);

  const lowConfidenceMappings = deriveUserMappings({
    assignedTo: 'Chris B',
    representative: 'Business Development',
    callCenterRep: 'Tony',
    repName: 'Tony',
    leadCreator: 'Tony',
  }, lookup);

  assert.equal(lowConfidenceMappings.owner?.userId, 'user-owner');
  assert.equal(lowConfidenceMappings.owner?.matchType, 'low_confidence');
  assert.equal(lowConfidenceMappings.leadSetBy?.matchType, 'unresolved');

  const aliasMappings = deriveUserMappings({
    assignedTo: 'Chris B',
    callCenterRep: 'Tony',
    repName: 'Tony',
    leadCreator: 'Tony',
  }, lookup, { tony: 'Anthony Valenti', 'chris b': 'Chris Barriera' });

  assert.equal(aliasMappings.owner?.userId, 'user-owner');
  assert.equal(aliasMappings.owner?.matchType, 'alias');
  assert.equal(aliasMappings.leadSetBy?.userId, 'user-setter');
  assert.equal(aliasMappings.leadSetBy?.matchType, 'alias');
});

test('deriveUserMappings resolves slash-delimited owner labels into 50/50 reporting credits', () => {
  const lookup = buildUserLookup([
    { id: 'user-marcus', firstName: 'Marcus', lastName: 'Booker', fullName: 'Marcus Booker', email: 'marcus@example.com' },
    { id: 'user-kj', firstName: 'KJ', lastName: 'Mitchell', fullName: 'KJ Mitchell', email: 'kj@example.com' },
  ]);

  const mappings = deriveUserMappings({
    assignedTo: 'Marcus/KJ',
    representative: null,
    callCenterRep: null,
    repName: 'Marcus/KJ',
    leadCreator: 'Tony',
  }, lookup, {
    marcus: 'Marcus Booker',
    kj: 'KJ Mitchell',
  });

  assert.equal(mappings.owner?.userId, 'user-marcus');
  assert.equal(mappings.ownerReportingCredits?.status, 'resolved');
  assert.deepEqual(mappings.ownerReportingCredits?.credits, [
    {
      userId: 'user-marcus',
      userName: 'Marcus Booker',
      creditPercent: 50,
      isActive: true,
      userStatus: null,
      matchType: 'alias',
      matchedBy: 'aliasMap',
    },
    {
      userId: 'user-kj',
      userName: 'KJ Mitchell',
      creditPercent: 50,
      isActive: true,
      userStatus: null,
      matchType: 'alias',
      matchedBy: 'aliasMap',
    },
  ]);
});

test('deriveUserMappings classifies known system labels without resolving them to CRM users', () => {
  const lookup = buildUserLookup([
    { id: 'user-company', firstName: 'Company', lastName: 'Lead', fullName: 'Company Lead', email: 'company.lead@example.com' },
  ]);

  const mappings = deriveUserMappings({
    assignedTo: 'Business Development',
    leadCreator: 'A.I.',
  }, lookup);

  assert.equal(mappings.owner?.matchType, 'system_label');
  assert.equal(mappings.owner?.classification, 'system');
  assert.equal(mappings.owner?.reason, 'Matched known non-user/system label and assigned Company Lead');
  assert.equal(mappings.owner?.userId, 'user-company');
  assert.equal(mappings.owner?.displayName, 'Company Lead');
  assert.equal(mappings.leadSetBy?.matchType, 'system_label');
  assert.equal(mappings.leadSetBy?.normalized, 'ai');
  assert.equal(mappings.leadSetBy?.classification, 'system');
  assert.equal(mappings.leadSetBy?.userId, 'user-company');
});

test('previewImport returns reviewed-plan lock metadata and suppresses obvious duplicate rows', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      { id: 'user-1', firstName: 'Tony', lastName: 'Valenti', fullName: 'Tony Valenti', email: 'tony@example.com' },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);

  const result = await service.previewImport({
    rows: [
      {
        sourceSheet: 'Leads Set on 317',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        time: '4:00 PM',
        callcenterrep: 'Tony Valenti',
        disposition: 'Scheduled',
      },
      {
        sourceSheet: 'Leads Set on 318',
        sourceRowNumber: 5,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        time: '4:00 PM',
        callcenterrep: 'Tony Valenti',
        disposition: 'Scheduled',
      },
    ],
  });

  assert.match(result.previewToken, /^cci_/);
  assert.equal(result.summary.totalRows, 2);
  assert.equal(result.summary.actionableRows, 1);
  assert.equal(result.diagnostics.reviewedPlanLock.singleUse, true);
  assert.equal(result.diagnostics.duplicates.summary.duplicateGroups, 1);
  assert.equal(result.diagnostics.duplicates.summary.suppressedRows, 1);
  assert.equal(result.rows.filter((row) => row.duplicateHandling.suppressed).length, 1);
  assert.equal(mockPrisma.__queryCounts.leadFindMany, 1);
});

test('previewImport reuses cached lead and opportunity lookups across repeated contact keys', async () => {
  const mockPrisma = createMockPrisma();
  const service = new CallCenterImportService(mockPrisma);

  await service.previewImport({
    rows: [
      {
        sourceSheet: 'Leads',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        email: 'jane@example.com',
        phone: '302-555-1212',
        date: '2026-03-17',
        eventType: 'LEAD_CREATED',
      },
      {
        sourceSheet: 'Leads',
        sourceRowNumber: 3,
        homeownername: 'Jane Example',
        email: 'jane@example.com',
        phone: '302-555-1212',
        date: '2026-03-18',
        eventType: 'LEAD_CREATED',
      },
    ],
  });

  assert.equal(mockPrisma.__queryCounts.leadFindMany, 3);
  assert.equal(mockPrisma.__queryCounts.contactFindMany, 1);
});

test('previewImport resolves inactive users for historical attribution and warns additively', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      {
        id: 'user-inactive',
        firstName: 'Rene',
        lastName: 'Ortez',
        fullName: 'Rene Ortez',
        email: 'rene@example.com',
        isActive: false,
        status: 'INACTIVE',
      },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);

  const result = await service.previewImport({
    rows: [
      {
        sourceSheet: 'Leads',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        assignedto: 'Rene Ortez',
        leadcreator: 'Rene Ortez',
        eventType: 'LEAD_CREATED',
      },
    ],
  });

  assert.equal(result.rows[0].userMappings.owner?.userId, 'user-inactive');
  assert.equal(result.rows[0].userMappings.owner?.isActive, false);
  assert.equal(result.rows[0].userMappings.leadSetBy?.userId, 'user-inactive');
  assert.equal(result.summary.userMappings.inactiveMatched, 2);
  assert.equal(result.diagnostics.executionGuards.counts.inactiveMatchedUsers, 2);
  assert.ok(result.rows[0].warnings.some((warning) => warning.code === 'OWNER_INACTIVE_USER'));
  assert.ok(result.rows[0].warnings.some((warning) => warning.code === 'LEAD_SETTER_INACTIVE_USER'));
});

test('previewImport flags split-owner labels that are only partially resolved', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      { id: 'user-marcus', firstName: 'Marcus', lastName: 'Booker', fullName: 'Marcus Booker', email: 'marcus@example.com' },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);

  const result = await service.previewImport({
    rows: [
      {
        sourceSheet: 'Manual Import',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        assignedto: 'Marcus/KJ',
      },
    ],
    userAliasMap: {
      marcus: 'Marcus Booker',
    },
  });

  assert.equal(result.rows[0].userMappings.ownerReportingCredits?.status, 'unresolved');
  assert.equal(result.summary.userMappings.splitIssues, 1);
  assert.equal(result.diagnostics.executionGuards.counts.splitOwnerMappingIssues, 1);
  assert.ok(result.diagnostics.executionGuards.blockers.some((blocker) => blocker.code === 'SPLIT_OWNER_MAPPING_ISSUES_PRESENT'));
  assert.ok(result.rows[0].warnings.some((warning) => warning.code === 'OWNER_SPLIT_CREDIT_UNRESOLVED'));
});

test('previewImport classifies system labels separately without adding execution blockers on their own', async () => {
  const service = new CallCenterImportService(createMockPrisma({
    users: [
      { id: 'user-company', firstName: 'Company', lastName: 'Lead', fullName: 'Company Lead', email: 'company.lead@example.com' },
    ],
  }));

  const result = await service.previewImport({
    rows: [
      {
        sourceSheet: 'Manual Import',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        assignedto: 'Business Development',
        leadcreator: 'AI',
      },
    ],
  });

  assert.equal(result.rows[0].userMappings.owner?.matchType, 'system_label');
  assert.equal(result.rows[0].userMappings.leadSetBy?.matchType, 'system_label');
  assert.equal(result.rows[0].userMappings.owner?.userId, 'user-company');
  assert.equal(result.rows[0].userMappings.leadSetBy?.userId, 'user-company');
  assert.equal(result.summary.userMappings.systemLabel, 2);
  assert.equal(result.summary.userMappings.systemLabels, 2);
  assert.equal(result.diagnostics.executionGuards.counts.systemLabelMappings, 2);
  assert.ok(!result.diagnostics.executionGuards.blockers.some((blocker) => blocker.code === 'SYSTEM_LABEL_REVIEW_REQUIRED'));
  assert.ok(result.rows[0].warnings.some((warning) => warning.code === 'OWNER_SYSTEM_LABEL'));
  assert.ok(result.rows[0].warnings.some((warning) => warning.code === 'LEAD_SETTER_SYSTEM_LABEL'));
});

test('executeImport requires a reviewed preview token', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      { id: 'user-1', firstName: 'Tony', lastName: 'Valenti', fullName: 'Tony Valenti', email: 'tony@example.com' },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);

  await assert.rejects(
    service.executeImport({
      confirm: true,
      rows: [
        {
          sourceSheet: 'Leads',
          sourceRowNumber: 2,
          homeownername: 'Jane Example',
          date: '2026-03-17',
          callcenterrep: 'Tony Valenti',
        },
      ],
    }),
    (error) => error?.code === 'PREVIEW_TOKEN_REQUIRED'
  );
});

test('executeImport persists resolved split-owner reporting credits on created leads', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      { id: 'user-marcus', firstName: 'Marcus', lastName: 'Booker', fullName: 'Marcus Booker', email: 'marcus@example.com' },
      { id: 'user-kj', firstName: 'KJ', lastName: 'Mitchell', fullName: 'KJ Mitchell', email: 'kj@example.com' },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);

  const preview = await service.previewImport({
    rows: [
      {
        sourceSheet: 'Manual Import',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        assignedto: 'Marcus/KJ',
      },
    ],
    userAliasMap: {
      marcus: 'Marcus Booker',
      kj: 'KJ Mitchell',
    },
  });

  const result = await service.executeImport({
    confirm: true,
    previewToken: preview.previewToken,
    rows: [
      {
        sourceSheet: 'Manual Import',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        assignedto: 'Marcus/KJ',
      },
    ],
    userAliasMap: {
      marcus: 'Marcus Booker',
      kj: 'KJ Mitchell',
    },
  });

  assert.equal(result.summary.createdLeads, 1);
  assert.deepEqual(mockPrisma.__createdLeads[0].reportingCredits, [
    { userId: 'user-marcus', userName: 'Marcus Booker', creditPercent: 50 },
    { userId: 'user-kj', userName: 'KJ Mitchell', creditPercent: 50 },
  ]);
});

test('executeImport assigns system labels to the configured Company Lead user', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      { id: 'user-company', firstName: 'Company', lastName: 'Lead', fullName: 'Company Lead', email: 'company.lead@example.com' },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);

  const rows = [
    {
      sourceSheet: 'Manual Import',
      sourceRowNumber: 2,
      homeownername: 'Jane Example',
      date: '2026-03-17',
      assignedto: 'Business Development',
      leadcreator: 'AI',
    },
  ];

  const preview = await service.previewImport({ rows });
  const result = await service.executeImport({
    confirm: true,
    previewToken: preview.previewToken,
    rows,
  });

  assert.equal(result.summary.createdLeads, 1);
  assert.equal(result.summary.failedRows, 0);
  assert.equal(mockPrisma.__createdLeads[0].owner?.connect?.id, 'user-company');
  assert.equal(mockPrisma.__createdLeads[0].leadSetBy?.connect?.id, 'user-company');
});

test('previewImport keeps split-owner labels with one user and one system label in split-owner review', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      { id: 'user-marcus', firstName: 'Marcus', lastName: 'Booker', fullName: 'Marcus Booker', email: 'marcus@example.com' },
      { id: 'user-company', firstName: 'Company', lastName: 'Lead', fullName: 'Company Lead', email: 'company.lead@example.com' },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);

  const result = await service.previewImport({
    rows: [
      {
        sourceSheet: 'Manual Import',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        assignedto: 'Marcus/AI',
      },
    ],
    userAliasMap: {
      marcus: 'Marcus Booker',
    },
  });

  assert.equal(result.rows[0].userMappings.owner?.matchType, 'alias');
  assert.equal(result.rows[0].userMappings.ownerReportingCredits?.status, 'unresolved');
  assert.equal(result.rows[0].userMappings.ownerReportingCredits?.tokenMappings?.[1]?.matchType, 'system_label');
  assert.equal(result.rows[0].userMappings.ownerReportingCredits?.tokenMappings?.[1]?.userId, 'user-company');
  assert.equal(result.diagnostics.executionGuards.counts.systemLabelMappings, 0);
  assert.equal(result.diagnostics.executionGuards.counts.splitOwnerMappingIssues, 1);
  assert.ok(result.diagnostics.executionGuards.blockers.some((blocker) => blocker.code === 'SPLIT_OWNER_MAPPING_ISSUES_PRESENT'));
});

test('executeImport rejects when the approved preview plan changes', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      { id: 'user-1', firstName: 'Anthony', lastName: 'Valenti', fullName: 'Anthony Valenti', email: 'tony@example.com' },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);

  const preview = await service.previewImport({
    rows: [
      {
        sourceSheet: 'Leads',
        sourceRowNumber: 2,
        homeownername: 'Jane Example',
        date: '2026-03-17',
        callcenterrep: 'Tony',
      },
    ],
    userAliasMap: {
      tony: 'Anthony Valenti',
    },
  });

  await assert.rejects(
    service.executeImport({
      confirm: true,
      previewToken: preview.previewToken,
      rows: [
        {
          sourceSheet: 'Leads',
          sourceRowNumber: 2,
          homeownername: 'Jane Example',
          date: '2026-03-17',
          callcenterrep: 'Tony',
        },
      ],
    }),
    (error) => error?.code === 'PREVIEW_SUMMARY_MISMATCH' || error?.code === 'PREVIEW_PLAN_MISMATCH'
  );
});

test('executeImport blocks risky unresolved user mappings unless override is explicit', async () => {
  const service = new CallCenterImportService(createMockPrisma({
    users: [
      { id: 'user-1', firstName: 'Tony', lastName: 'Valenti', fullName: 'Tony Valenti', email: 'tony@example.com' },
    ],
  }));

  const rows = [0, 1, 2, 3].map((index) => ({
    sourceSheet: 'Leads Set on 317',
    sourceRowNumber: index + 2,
    homeownername: `Jane Example ${index}`,
    date: `2026-03-${17 + index}`,
    time: '10:00 AM',
    callcenterrep: 'Unknown Setter',
    assignedto: 'Unknown Owner',
    disposition: 'Scheduled',
  }));

  const preview = await service.previewImport({ rows });
  assert.equal(preview.diagnostics.executionGuards.requiresManualOverride, true);

  await assert.rejects(
    service.executeImport({
      confirm: true,
      previewToken: preview.previewToken,
      rows,
    }),
    (error) => error?.code === 'EXECUTION_GUARDRAIL_BLOCK'
  );
});

test('executeImport consumes preview tokens after a successful reviewed execution', async () => {
  const mockPrisma = createMockPrisma({
    users: [
      { id: 'user-1', firstName: 'Tony', lastName: 'Valenti', fullName: 'Tony Valenti', email: 'tony@example.com' },
    ],
  });
  const service = new CallCenterImportService(mockPrisma);
  const rows = [
    {
      sourceSheet: 'Manual Import',
      sourceRowNumber: 2,
      homeownername: 'Jane Example',
      date: '2026-03-17',
      callcenterrep: 'Tony Valenti',
      eventType: 'LEAD_CREATED',
    },
  ];

  const preview = await service.previewImport({ rows });
  const execution = await service.executeImport({
    confirm: true,
    previewToken: preview.previewToken,
    rows,
  });

  assert.equal(execution.summary.appliedRows, 1);
  assert.equal(mockPrisma.__createdLeads.length, 1);
  assert.equal(mockPrisma.__auditEntries.length, 1);
  assert.ok(execution.preview.consumedAt);

  await assert.rejects(
    service.executeImport({
      confirm: true,
      previewToken: preview.previewToken,
      rows,
    }),
    (error) => error?.code === 'PREVIEW_TOKEN_ALREADY_USED'
  );
});

test('executeImport can validate a reviewed preview from durable storage after in-memory cache reset', async () => {
  const sharedSettings = new Map();
  const previewPrisma = createMockPrisma({
    users: [
      { id: 'user-1', firstName: 'Tony', lastName: 'Valenti', fullName: 'Tony Valenti', email: 'tony@example.com' },
    ],
    systemSettings: sharedSettings,
  });
  const executePrisma = createMockPrisma({
    users: [
      { id: 'user-1', firstName: 'Tony', lastName: 'Valenti', fullName: 'Tony Valenti', email: 'tony@example.com' },
    ],
    systemSettings: sharedSettings,
  });

  const previewService = new CallCenterImportService(previewPrisma);
  const executeService = new CallCenterImportService(executePrisma);
  const rows = [
    {
      sourceSheet: 'Manual Import',
      sourceRowNumber: 2,
      homeownername: 'Jane Example',
      date: '2026-03-17',
      callcenterrep: 'Tony Valenti',
      eventType: 'LEAD_CREATED',
    },
  ];

  const preview = await previewService.previewImport({ rows });
  resetPreviewPlanRegistryForTest();

  const execution = await executeService.executeImport({
    confirm: true,
    previewToken: preview.previewToken,
    rows,
  });

  assert.equal(execution.summary.appliedRows, 1);
  assert.equal(executePrisma.__createdLeads.length, 1);
  assert.ok(executePrisma.__queryCounts.systemSettingFindUnique >= 1);
});

test('durably persisted preview tokens remain single-use after in-memory cache reset', async () => {
  const sharedSettings = new Map();
  const prisma = createMockPrisma({
    users: [
      { id: 'user-1', firstName: 'Tony', lastName: 'Valenti', fullName: 'Tony Valenti', email: 'tony@example.com' },
    ],
    systemSettings: sharedSettings,
  });
  const service = new CallCenterImportService(prisma);
  const rows = [
    {
      sourceSheet: 'Manual Import',
      sourceRowNumber: 2,
      homeownername: 'Jane Example',
      date: '2026-03-17',
      callcenterrep: 'Tony Valenti',
      eventType: 'LEAD_CREATED',
    },
  ];

  const preview = await service.previewImport({ rows });
  await service.executeImport({
    confirm: true,
    previewToken: preview.previewToken,
    rows,
  });

  resetPreviewPlanRegistryForTest();

  await assert.rejects(
    service.executeImport({
      confirm: true,
      previewToken: preview.previewToken,
      rows,
    }),
    (error) => error?.code === 'PREVIEW_TOKEN_ALREADY_USED'
  );
});

test('inferSheetCategory preserves workbook family detection for current report tabs', () => {
  assert.equal(inferSheetCategory('Leads Set on 317'), 'lead_set');
  assert.equal(inferSheetCategory('Confirmation Report 317'), 'confirmation');
  assert.equal(inferSheetCategory('ALL March APPOINTMENTS'), 'appointments');
});
