import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChecklistCompletionRequirements } from '../validationService.js';

test('flags missing photo count and completion for required item', () => {
  const result = evaluateChecklistCompletionRequirements({
    sections: [
      {
        id: 's1',
        name: 'Section 1',
        items: [
          {
            id: 'i1',
            name: 'Item 1',
            isRequired: true,
            isCompleted: false,
            requiresPhoto: true,
            minPhotoCount: 2,
            photos: [{ photo: { id: 'p1' } }],
          },
        ],
      },
    ],
  });

  assert.equal(result.requiredItems, 1);
  assert.equal(result.completedItems, 0);
  assert.equal(result.missingRequirements.length, 1);
  assert.deepEqual(result.missingRequirements[0].issues.sort(), ['ITEM_NOT_COMPLETED', 'MIN_PHOTO_COUNT_NOT_MET']);
});

test('passes when required item satisfies notes/gps/timestamp/photo requirements', () => {
  const result = evaluateChecklistCompletionRequirements({
    sections: [
      {
        id: 's1',
        name: 'Section 1',
        items: [
          {
            id: 'i1',
            name: 'Item 1',
            isRequired: true,
            isCompleted: true,
            requiresPhoto: true,
            minPhotoCount: 1,
            notesRequired: true,
            gpsRequired: true,
            timestampRequired: true,
            notes: 'Looks good',
            photos: [
              {
                photo: {
                  id: 'p1',
                  latitude: 38.9,
                  longitude: -77.0,
                  capturedAt: new Date().toISOString(),
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(result.requiredItems, 1);
  assert.equal(result.completedItems, 1);
  assert.equal(result.missingRequirements.length, 0);
});
