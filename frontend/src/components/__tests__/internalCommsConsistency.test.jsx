import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadBody } from '../ThreadMessageList';

describe('internal comms UI consistency', () => {
  it('highlights @mentions in shared thread body renderer', () => {
    const html = renderToStaticMarkup(
      <ThreadBody text="Ping @Rob Winters about this update" />
    );

    expect(html).toContain('text-panda-primary');
    expect(html).toContain('@Rob Winters');
  });

  it('uses shared ThreadMessageList in both InternalNotesTabs and InternalComments', () => {
    const notesPath = path.resolve(process.cwd(), 'src/components/InternalNotesTabs.jsx');
    const commentsPath = path.resolve(process.cwd(), 'src/components/InternalComments.jsx');

    const notesSource = fs.readFileSync(notesPath, 'utf8');
    const commentsSource = fs.readFileSync(commentsPath, 'utf8');

    expect(notesSource).toMatch(/ThreadMessageList/);
    expect(commentsSource).toMatch(/ThreadMessageList/);
  });

  it('archive section in job communications remains read-only (no mention composer)', () => {
    const opportunityPath = path.resolve(process.cwd(), 'src/pages/OpportunityDetail.jsx');
    const source = fs.readFileSync(opportunityPath, 'utf8');

    const archiveSectionMatch = source.match(/\/\* Sub-tabs: Live \/ Archive \*\/[\s\S]*?archivedActivities\.length/);
    expect(archiveSectionMatch).toBeTruthy();
    expect(source).not.toMatch(/archived[\s\S]{0,400}MentionTextarea/);
  });
});
