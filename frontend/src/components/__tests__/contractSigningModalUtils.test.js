import { describe, expect, it } from 'vitest';
import {
  extractHostSigningToken,
  extractSigningToken,
  formatAgreementStatusLabel,
  getAgreementDocumentUrl,
  getAgreementId,
  getAgreementStatusClasses,
  getChecklist,
  getMissingItems,
  getSignerRequiredFields,
  mergeAgreementState,
  normalizeAgreementStatus,
  normalizePreviewPayload,
} from '../contractSigningModalUtils';

describe('contractSigningModalUtils', () => {
  it('normalizes preview payloads from nested API envelopes', () => {
    const normalized = normalizePreviewPayload({
      previewUrl: 'outer-preview',
      data: {
        previewHash: 'nested-hash',
        documentUrl: 'nested-doc',
      },
    });

    expect(normalized.previewUrl).toBe('outer-preview');
    expect(normalized.previewHash).toBe('nested-hash');
    expect(normalized.documentUrl).toBe('nested-doc');
  });

  it('extracts customer and host tokens from direct values or urls', () => {
    expect(extractSigningToken({ customerSigningToken: 'customer-token' })).toBe('customer-token');
    expect(extractSigningToken({ signingUrl: 'https://sign.pandaexteriors.com/sign/abc123?foo=bar' })).toBe('abc123');
    expect(extractHostSigningToken({ hostSigningUrl: 'https://sign.pandaexteriors.com/host-sign/host456?embedded=true' })).toBe('host456');
  });

  it('merges agreement state and resolves agreement ids and document urls', () => {
    const merged = mergeAgreementState(
      { id: 'agr-1', status: 'SENT', signingUrl: 'customer-link' },
      { status: 'COMPLETED', signedDocumentUrl: 'signed-doc' }
    );

    expect(getAgreementId(merged)).toBe('agr-1');
    expect(merged.status).toBe('COMPLETED');
    expect(getAgreementDocumentUrl(merged)).toBe('signed-doc');
  });

  it('normalizes and formats agreement statuses for send-to-sign UI', () => {
    expect(normalizeAgreementStatus('partially_signed')).toBe('PARTIALLY_SIGNED');
    expect(formatAgreementStatusLabel('PARTIALLY_SIGNED')).toBe('Partially Signed');
    expect(getAgreementStatusClasses('COMPLETED')).toBe('bg-green-100 text-green-700');
    expect(getAgreementStatusClasses('VIEWED')).toBe('bg-amber-100 text-amber-700');
  });

  it('collects checklist and missing field items from verification payloads', () => {
    const verification = {
      data: {
        checklist: ['Template selected', 'Emails confirmed'],
        requiredFieldFailures: [{ field: 'customer.email' }],
        missingTokens: [{ token: 'account.name' }],
      },
    };

    expect(getChecklist(verification)).toEqual(['Template selected', 'Emails confirmed']);
    expect(getMissingItems(verification)).toEqual(['customer.email', 'account.name']);
  });

  it('returns role-specific required fields without leaking the other signer role', () => {
    const signSession = {
      fieldsToSign: [
        { id: 'cust-sign', role: 'CUSTOMER', type: 'signature', label: 'Customer Signature' },
        { id: 'agent-sign', role: 'AGENT', type: 'signature', label: 'Agent Signature' },
      ],
    };

    expect(getSignerRequiredFields(signSession, 'CUSTOMER')).toEqual([
      expect.objectContaining({ id: 'cust-sign', role: 'CUSTOMER', label: 'Customer Signature' }),
    ]);
    expect(getSignerRequiredFields(signSession, 'AGENT')).toEqual([
      expect.objectContaining({ id: 'agent-sign', role: 'AGENT', label: 'Agent Signature' }),
    ]);
  });

  it('falls back to the session role when generic field data has no explicit role metadata', () => {
    const signSession = {
      signerRole: 'AGENT',
      fieldsToSign: [
        { id: 'field-1', type: 'signature', name: 'Sign Here' },
      ],
    };

    expect(getSignerRequiredFields(signSession, 'CUSTOMER')).toEqual([]);
    expect(getSignerRequiredFields(signSession, 'AGENT')).toEqual([
      expect.objectContaining({ id: 'field-1', role: 'AGENT', label: 'Sign Here' }),
    ]);
  });
});
