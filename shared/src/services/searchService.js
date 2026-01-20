// Global Search Service using PostgreSQL Full-Text Search
// Provides unified search across all CRM entities
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class SearchService {
  /**
   * Global search across all entities
   * Uses PostgreSQL full-text search with ts_vector and ts_query
   */
  async globalSearch(query, options = {}) {
    const {
      types = ['account', 'contact', 'lead', 'opportunity'],
      limit = 20,
      userId,
      includeInactive = false,
    } = options;

    if (!query || query.trim().length < 2) {
      return { results: [], total: 0 };
    }

    // Clean and prepare search query for PostgreSQL
    const searchTerms = this.prepareSearchQuery(query);
    const results = [];

    // Execute searches in parallel for better performance
    const searchPromises = [];

    if (types.includes('account')) {
      searchPromises.push(this.searchAccounts(searchTerms, limit, includeInactive));
    }
    if (types.includes('contact')) {
      searchPromises.push(this.searchContacts(searchTerms, limit));
    }
    if (types.includes('lead')) {
      searchPromises.push(this.searchLeads(searchTerms, limit, includeInactive));
    }
    if (types.includes('opportunity')) {
      searchPromises.push(this.searchOpportunities(searchTerms, limit));
    }

    const searchResults = await Promise.all(searchPromises);

    // Merge and sort by relevance
    searchResults.forEach(typeResults => {
      results.push(...typeResults);
    });

    // Sort by relevance score (descending)
    results.sort((a, b) => b.score - a.score);

    return {
      results: results.slice(0, limit),
      total: results.length,
      query: query,
    };
  }

  /**
   * Prepare search query for PostgreSQL FTS
   * Converts user input to tsquery format
   */
  prepareSearchQuery(query) {
    // Split into words, escape special characters, add prefix matching
    return query
      .trim()
      .split(/\s+/)
      .filter(term => term.length >= 2)
      .map(term => term.replace(/[^\w]/g, ''))
      .filter(term => term.length >= 2)
      .map(term => `${term}:*`)
      .join(' & ');
  }

  /**
   * Search Accounts
   */
  async searchAccounts(searchTerms, limit, includeInactive) {
    const statusFilter = includeInactive ? '' : "AND status != 'INACTIVE'";

    const results = await prisma.$queryRaw`
      SELECT
        id,
        'account' as type,
        name as title,
        COALESCE(billing_city, '') || ', ' || COALESCE(billing_state, '') as subtitle,
        phone,
        email,
        status,
        ts_rank(
          setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(account_number, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(phone, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(email, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(billing_city, '') || ' ' || COALESCE(billing_state, '')), 'C'),
          to_tsquery('english', ${searchTerms})
        ) as score
      FROM accounts
      WHERE (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(account_number, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(phone, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(email, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(billing_city, '') || ' ' || COALESCE(billing_state, '')), 'C')
      ) @@ to_tsquery('english', ${searchTerms})
      ${Prisma.raw(statusFilter)}
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return results.map(r => ({
      id: r.id,
      type: 'account',
      title: r.title,
      subtitle: r.subtitle,
      phone: r.phone,
      email: r.email,
      status: r.status,
      score: parseFloat(r.score) || 0,
      url: `/accounts/${r.id}`,
    }));
  }

  /**
   * Search Contacts
   */
  async searchContacts(searchTerms, limit) {
    const results = await prisma.$queryRaw`
      SELECT
        c.id,
        'contact' as type,
        COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') as title,
        COALESCE(a.name, 'No Account') as subtitle,
        c.phone,
        c.email,
        c.account_id,
        ts_rank(
          setweight(to_tsvector('english', COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(c.email, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(c.phone, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(c.mobile_phone, '')), 'B'),
          to_tsquery('english', ${searchTerms})
        ) as score
      FROM contacts c
      LEFT JOIN accounts a ON c.account_id = a.id
      WHERE (
        setweight(to_tsvector('english', COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(c.email, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(c.phone, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(c.mobile_phone, '')), 'B')
      ) @@ to_tsquery('english', ${searchTerms})
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return results.map(r => ({
      id: r.id,
      type: 'contact',
      title: r.title,
      subtitle: r.subtitle,
      phone: r.phone,
      email: r.email,
      accountId: r.account_id,
      score: parseFloat(r.score) || 0,
      url: `/contacts/${r.id}`,
    }));
  }

  /**
   * Search Leads
   */
  async searchLeads(searchTerms, limit, includeInactive) {
    const statusFilter = includeInactive ? '' : "AND status != 'CONVERTED'";

    const results = await prisma.$queryRaw`
      SELECT
        id,
        'lead' as type,
        COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') as title,
        COALESCE(company, city || ', ' || state) as subtitle,
        phone,
        email,
        status,
        ts_rank(
          setweight(to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(company, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(email, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(phone, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(city, '') || ' ' || COALESCE(state, '')), 'C'),
          to_tsquery('english', ${searchTerms})
        ) as score
      FROM leads
      WHERE (
        setweight(to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(company, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(email, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(phone, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(city, '') || ' ' || COALESCE(state, '')), 'C')
      ) @@ to_tsquery('english', ${searchTerms})
      ${Prisma.raw(statusFilter)}
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return results.map(r => ({
      id: r.id,
      type: 'lead',
      title: r.title,
      subtitle: r.subtitle,
      phone: r.phone,
      email: r.email,
      status: r.status,
      score: parseFloat(r.score) || 0,
      url: `/leads/${r.id}`,
    }));
  }

  /**
   * Search Opportunities
   */
  async searchOpportunities(searchTerms, limit) {
    const results = await prisma.$queryRaw`
      SELECT
        o.id,
        'opportunity' as type,
        o.name as title,
        COALESCE(a.name, '') || ' - ' || o.stage as subtitle,
        o.stage,
        o.amount,
        o.account_id,
        ts_rank(
          setweight(to_tsvector('english', COALESCE(o.name, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(o.claim_number, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(o.city, '') || ' ' || COALESCE(o.state, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(o.street, '')), 'C'),
          to_tsquery('english', ${searchTerms})
        ) as score
      FROM opportunities o
      LEFT JOIN accounts a ON o.account_id = a.id
      WHERE (
        setweight(to_tsvector('english', COALESCE(o.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(o.claim_number, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(o.city, '') || ' ' || COALESCE(o.state, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(o.street, '')), 'C')
      ) @@ to_tsquery('english', ${searchTerms})
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return results.map(r => ({
      id: r.id,
      type: 'opportunity',
      title: r.title,
      subtitle: r.subtitle,
      stage: r.stage,
      amount: r.amount ? parseFloat(r.amount) : null,
      accountId: r.account_id,
      score: parseFloat(r.score) || 0,
      url: `/opportunities/${r.id}`,
    }));
  }

  /**
   * Simple search for autocomplete (faster, less comprehensive)
   */
  async quickSearch(query, options = {}) {
    const { types = ['account', 'contact', 'lead', 'opportunity'], limit = 10 } = options;

    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchPattern = `%${query.toLowerCase()}%`;
    const results = [];

    // Use ILIKE for faster prefix matching
    if (types.includes('account')) {
      const accounts = await prisma.account.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { accountNumber: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
          ],
        },
        select: { id: true, name: true, billingCity: true, billingState: true },
        take: limit,
      });
      results.push(...accounts.map(a => ({
        id: a.id,
        type: 'account',
        title: a.name,
        subtitle: `${a.billingCity || ''}, ${a.billingState || ''}`.trim() || null,
        url: `/accounts/${a.id}`,
      })));
    }

    if (types.includes('contact')) {
      const contacts = await prisma.contact.findMany({
        where: {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          account: { select: { name: true } }
        },
        take: limit,
      });
      results.push(...contacts.map(c => ({
        id: c.id,
        type: 'contact',
        title: `${c.firstName} ${c.lastName}`,
        subtitle: c.account?.name || null,
        url: `/contacts/${c.id}`,
      })));
    }

    if (types.includes('lead')) {
      const leads = await prisma.lead.findMany({
        where: {
          isConverted: false,
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { company: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, company: true },
        take: limit,
      });
      results.push(...leads.map(l => ({
        id: l.id,
        type: 'lead',
        title: `${l.firstName} ${l.lastName}`,
        subtitle: l.company || null,
        url: `/leads/${l.id}`,
      })));
    }

    if (types.includes('opportunity')) {
      const opportunities = await prisma.opportunity.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { claimNumber: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          stage: true,
          account: { select: { name: true } }
        },
        take: limit,
      });
      results.push(...opportunities.map(o => ({
        id: o.id,
        type: 'opportunity',
        title: o.name,
        subtitle: `${o.account?.name || ''} - ${o.stage}`.trim(),
        url: `/opportunities/${o.id}`,
      })));
    }

    return results.slice(0, limit);
  }

  /**
   * Create GIN indexes for full-text search (run once during setup)
   */
  async createSearchIndexes() {
    // Create GIN indexes for each table
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_accounts_fts ON accounts USING GIN (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(account_number, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(phone, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(email, '')), 'B')
      );
    `;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_contacts_fts ON contacts USING GIN (
        setweight(to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(email, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(phone, '')), 'B')
      );
    `;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_leads_fts ON leads USING GIN (
        setweight(to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(company, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(email, '')), 'A')
      );
    `;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_opportunities_fts ON opportunities USING GIN (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(claim_number, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(city, '') || ' ' || COALESCE(state, '')), 'B')
      );
    `;

    console.log('Full-text search indexes created successfully');
  }
}

export const searchService = new SearchService();
