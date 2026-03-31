function normalizeOpportunityQuery(query = {}) {
  if (!query || Object.keys(query).length === 0) {
    return {};
  }

  if (query.select || query.include) {
    return query;
  }

  return { select: query };
}

// Accept either a Prisma args object or a raw select shape so callers cannot
// accidentally nest `select.select` and trigger runtime validation failures.
export async function findOpportunityByIdOrJobId(db, opportunityId, query = {}) {
  const normalizedQuery = normalizeOpportunityQuery(query);

  const opportunity = await db.opportunity.findUnique({
    where: { id: opportunityId },
    ...normalizedQuery,
  });

  if (opportunity) {
    return opportunity;
  }

  return db.opportunity.findFirst({
    where: { jobId: opportunityId },
    ...normalizedQuery,
  });
}
