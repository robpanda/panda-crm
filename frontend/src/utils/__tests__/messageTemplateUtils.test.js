import { describe, expect, it } from 'vitest';
import {
  buildMessageMergeContext,
  htmlToPlainText,
  interpolateMessageTemplate,
  templateLooksLikeHtml,
} from '../messageTemplateUtils';

describe('messageTemplateUtils', () => {
  it('interpolates current nested merge fields', () => {
    const context = buildMessageMergeContext({
      firstName: 'Eric',
      lastName: 'Watson',
      company: 'Panda Exteriors',
      tentativeAppointmentDate: '2026-03-17',
      tentativeAppointmentTime: '09:00',
    });

    expect(
      interpolateMessageTemplate(
        'Hi {{contact.firstName}}, your appointment is {{appointment.date}} at {{appointment.time}} from {{organization.name}}.',
        context,
      ),
    ).toBe('Hi Eric, your appointment is 03/17/2026 at 9:00 AM from Panda Exteriors.');
  });

  it('leaves CSS braces intact inside html templates', () => {
    const context = buildMessageMergeContext({ firstName: 'Eric' });

    expect(
      interpolateMessageTemplate(
        '<style>.button { display:block; }</style><p>Hello {{contact.firstName}}</p>',
        context,
      ),
    ).toBe('<style>.button { display:block; }</style><p>Hello Eric</p>');
  });

  it('detects html and creates a readable plain-text fallback', () => {
    expect(templateLooksLikeHtml('<p>Hello <strong>Eric</strong><br />See you soon.</p>')).toBe(true);
    expect(htmlToPlainText('<p>Hello <strong>Eric</strong><br />See you soon.</p>')).toBe('Hello Eric\nSee you soon.');
  });
});
