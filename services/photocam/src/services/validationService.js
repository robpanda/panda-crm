export function validateTemplateForPublishPayload(template) {
  if (template.templateType === 'CHECKLIST') {
    const sections = template.structure?.sections;
    if (!Array.isArray(sections) || sections.length === 0) {
      const error = new Error('Checklist templates require at least one section before publishing');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }
  }

  if (template.templateType === 'REPORT') {
    const hasReportConfig = template.configJson && typeof template.configJson === 'object';
    if (!hasReportConfig) {
      const error = new Error('Report templates require configJson before publishing');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }
  }
}

export function evaluateChecklistCompletionRequirements(checklist) {
  const missingRequirements = [];
  let requiredItems = 0;
  let completedItems = 0;

  for (const section of checklist.sections || []) {
    for (const item of section.items || []) {
      const isRequired = Boolean(item.isRequired);
      if (!isRequired) continue;

      requiredItems += 1;
      const issues = [];

      if (item.isCompleted) {
        completedItems += 1;
      } else {
        issues.push('ITEM_NOT_COMPLETED');
      }

      const attachedPhotos = Array.isArray(item.photos) ? item.photos : [];
      const minPhotoCount = Math.max(1, item.minPhotoCount || (item.requiresPhoto ? 1 : 0));
      if (minPhotoCount > 0 && attachedPhotos.length < minPhotoCount) {
        issues.push('MIN_PHOTO_COUNT_NOT_MET');
      }

      if (item.notesRequired && !String(item.notes || '').trim()) {
        issues.push('NOTES_REQUIRED');
      }

      if (item.gpsRequired) {
        const hasGpsPhoto = attachedPhotos.some((attachment) => {
          const photo = attachment.photo || {};
          return photo.latitude !== null && photo.latitude !== undefined
            && photo.longitude !== null && photo.longitude !== undefined;
        });
        if (!hasGpsPhoto) issues.push('GPS_REQUIRED');
      }

      if (item.timestampRequired) {
        const hasTimestampPhoto = attachedPhotos.some((attachment) => {
          const photo = attachment.photo || {};
          return Boolean(photo.capturedAt);
        });
        if (!hasTimestampPhoto) issues.push('TIMESTAMP_REQUIRED');
      }

      if (issues.length) {
        missingRequirements.push({
          sectionId: section.id,
          sectionName: section.name,
          itemId: item.id,
          itemName: item.name,
          issues,
        });
      }
    }
  }

  return {
    requiredItems,
    completedItems,
    missingRequirements,
  };
}
