export function getOpportunityDisplayName(name) {
  if (!name) return '';
  return String(name).replace(/\s+-\s+\d{1,2}\/\d{1,2}\/\d{4}$/, '');
}
