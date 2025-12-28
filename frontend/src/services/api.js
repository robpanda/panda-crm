import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

// Create axios instance with interceptors
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE}/api/auth/refresh`, {
            refreshToken,
          });

          const { accessToken, idToken } = response.data.data;
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('idToken', idToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  async login(email, password) {
    const response = await axios.post(`${API_BASE}/api/auth/login`, { email, password });
    return response.data.data;
  },

  async completeNewPassword(email, newPassword, session) {
    const response = await axios.post(`${API_BASE}/api/auth/complete-new-password`, {
      email,
      newPassword,
      session,
    });
    return response.data.data;
  },

  async refreshToken(refreshToken) {
    const response = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken });
    return response.data.data;
  },

  async getCurrentUser(accessToken) {
    const response = await axios.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data.data;
  },

  async logout(accessToken) {
    await axios.post(
      `${API_BASE}/api/auth/logout`,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  },

  async forgotPassword(email) {
    const response = await axios.post(`${API_BASE}/api/auth/forgot-password`, { email });
    return response.data.data;
  },

  async resetPassword(email, code, newPassword) {
    const response = await axios.post(`${API_BASE}/api/auth/reset-password`, {
      email,
      code,
      newPassword,
    });
    return response.data.data;
  },
};

// Accounts API
export const accountsApi = {
  async getAccounts(params = {}) {
    const response = await api.get('/api/accounts', { params });
    return response.data;
  },

  async getAccount(id) {
    const response = await api.get(`/api/accounts/${id}`);
    return response.data.data;
  },

  async createAccount(data) {
    const response = await api.post('/api/accounts', data);
    return response.data.data;
  },

  async updateAccount(id, data) {
    const response = await api.put(`/api/accounts/${id}`, data);
    return response.data.data;
  },

  async deleteAccount(id) {
    const response = await api.delete(`/api/accounts/${id}`);
    return response.data.data;
  },

  async searchAccounts(query) {
    const response = await api.get('/api/accounts/search', { params: { q: query } });
    return response.data.data;
  },
};

// Contacts API
export const contactsApi = {
  async getContacts(params = {}) {
    const response = await api.get('/api/contacts', { params });
    return response.data;
  },

  async getContact(id) {
    const response = await api.get(`/api/contacts/${id}`);
    return response.data.data;
  },

  async createContact(data) {
    const response = await api.post('/api/contacts', data);
    return response.data.data;
  },

  async updateContact(id, data) {
    const response = await api.put(`/api/contacts/${id}`, data);
    return response.data.data;
  },

  async deleteContact(id) {
    const response = await api.delete(`/api/contacts/${id}`);
    return response.data.data;
  },

  async getReviewEligible(params = {}) {
    const response = await api.get('/api/contacts/review-eligible', { params });
    return response.data.data;
  },
};

// Leads API
export const leadsApi = {
  async getLeads(params = {}) {
    const response = await api.get('/api/leads', { params });
    return response.data;
  },

  async getLead(id) {
    const response = await api.get(`/api/leads/${id}`);
    return response.data.data;
  },

  async createLead(data) {
    const response = await api.post('/api/leads', data);
    return response.data.data;
  },

  async updateLead(id, data) {
    const response = await api.put(`/api/leads/${id}`, data);
    return response.data.data;
  },

  async deleteLead(id) {
    const response = await api.delete(`/api/leads/${id}`);
    return response.data.data;
  },

  async convertLead(id, data) {
    const response = await api.post(`/api/leads/${id}/convert`, data);
    return response.data.data;
  },

  async getLeadCounts() {
    const response = await api.get('/api/leads/counts');
    return response.data.data;
  },

  // Assignment Settings
  async getAssignmentSettings() {
    const response = await api.get('/api/leads/assignment/settings');
    return response.data.data;
  },

  async toggleRoundRobin(enabled) {
    const response = await api.post('/api/leads/assignment/settings/round-robin', { enabled });
    return response.data;
  },

  async toggleAutoAssignment(enabled) {
    const response = await api.post('/api/leads/assignment/settings/auto-assignment', { enabled });
    return response.data;
  },

  // Assignment Rules
  async getAssignmentRules(includeInactive = false) {
    const response = await api.get('/api/leads/assignment/rules', {
      params: { includeInactive },
    });
    return response.data.data;
  },

  async getAssignmentRule(id) {
    const response = await api.get(`/api/leads/assignment/rules/${id}`);
    return response.data.data;
  },

  async createAssignmentRule(data) {
    const response = await api.post('/api/leads/assignment/rules', data);
    return response.data.data;
  },

  async updateAssignmentRule(id, data) {
    const response = await api.put(`/api/leads/assignment/rules/${id}`, data);
    return response.data.data;
  },

  async deleteAssignmentRule(id) {
    const response = await api.delete(`/api/leads/assignment/rules/${id}`);
    return response.data.data;
  },

  async toggleAssignmentRule(id) {
    const response = await api.post(`/api/leads/assignment/rules/${id}/toggle`);
    return response.data.data;
  },

  // Auto-assign a lead
  async autoAssignLead(leadId) {
    const response = await api.post(`/api/leads/assignment/assign/${leadId}`);
    return response.data.data;
  },

  // Manual assign a lead
  async manualAssignLead(leadId, assignToUserId, notes = null) {
    const response = await api.post(`/api/leads/assignment/assign/${leadId}/manual`, {
      assignToUserId,
      notes,
    });
    return response.data.data;
  },

  // Bulk assign leads
  async bulkAssignLeads(leadIds) {
    const response = await api.post('/api/leads/assignment/assign/bulk', { leadIds });
    return response.data.data;
  },

  // Get assignment history
  async getLeadAssignmentHistory(leadId) {
    const response = await api.get(`/api/leads/assignment/history/${leadId}`);
    return response.data.data;
  },

  // Get assignment statistics
  async getAssignmentStats(params = {}) {
    const response = await api.get('/api/leads/assignment/stats', { params });
    return response.data.data;
  },
};

// Opportunities API
export const opportunitiesApi = {
  async getOpportunities(params = {}) {
    const response = await api.get('/api/opportunities', { params });
    return response.data;
  },

  async getOpportunity(id) {
    const response = await api.get(`/api/opportunities/${id}`);
    return response.data.data;
  },

  async createOpportunity(data) {
    const response = await api.post('/api/opportunities', data);
    return response.data.data;
  },

  async updateOpportunity(id, data) {
    const response = await api.put(`/api/opportunities/${id}`, data);
    return response.data.data;
  },

  async deleteOpportunity(id) {
    const response = await api.delete(`/api/opportunities/${id}`);
    return response.data.data;
  },

  async getWorkOrders(id) {
    const response = await api.get(`/api/opportunities/${id}/work-orders`);
    return response.data.data;
  },

  async getQuotes(id) {
    const response = await api.get(`/api/opportunities/${id}/quotes`);
    return response.data.data;
  },

  async getContacts(id) {
    const response = await api.get(`/api/opportunities/${id}/contacts`);
    return response.data.data;
  },

  async getStageCounts(ownerFilter, ownerIds) {
    const params = { ownerFilter };
    if (ownerIds && ownerIds.length > 0) {
      params.ownerIds = ownerIds.join(',');
    }
    const response = await api.get('/api/opportunities/counts', { params });
    return response.data.data;
  },

  // ============================================================================
  // OPPORTUNITY HUB ENDPOINTS
  // These power the Opportunity Hub view - the central project dashboard
  // ============================================================================

  // Get hub summary with counts of all related records
  async getSummary(id) {
    const response = await api.get(`/api/opportunities/${id}/summary`);
    return response.data.data;
  },

  // Get service appointments (via WorkOrders)
  async getAppointments(id) {
    const response = await api.get(`/api/opportunities/${id}/appointments`);
    return response.data.data;
  },

  // Get service contract
  async getContract(id) {
    const response = await api.get(`/api/opportunities/${id}/contract`);
    return response.data.data;
  },

  // Get invoices and payments
  async getInvoices(id) {
    const response = await api.get(`/api/opportunities/${id}/invoices`);
    return response.data.data;
  },

  // Get commissions
  async getCommissions(id) {
    const response = await api.get(`/api/opportunities/${id}/commissions`);
    return response.data.data;
  },

  // Get unified activity timeline (notes, tasks, events)
  async getActivity(id, params = {}) {
    const response = await api.get(`/api/opportunities/${id}/activity`, { params });
    return response.data.data;
  },

  // Get documents/agreements
  async getDocuments(id) {
    const response = await api.get(`/api/opportunities/${id}/documents`);
    return response.data.data;
  },
};

// Price Books API
export const priceBooksApi = {
  async getPriceBooks(params = {}) {
    const response = await api.get('/api/pricebooks', { params });
    return response.data;
  },

  async getPriceBook(id) {
    const response = await api.get(`/api/pricebooks/${id}`);
    return response.data.data;
  },

  async createPriceBook(data) {
    const response = await api.post('/api/pricebooks', data);
    return response.data.data;
  },

  async updatePriceBook(id, data) {
    const response = await api.put(`/api/pricebooks/${id}`, data);
    return response.data.data;
  },

  async deletePriceBook(id) {
    const response = await api.delete(`/api/pricebooks/${id}`);
    return response.data.data;
  },

  async getEntries(id, params = {}) {
    const response = await api.get(`/api/pricebooks/${id}/entries`, { params });
    return response.data;
  },
};

// Products API
export const productsApi = {
  async getProducts(params = {}) {
    const response = await api.get('/api/products', { params });
    return response.data;
  },

  async getProduct(id) {
    const response = await api.get(`/api/products/${id}`);
    return response.data.data;
  },

  async createProduct(data) {
    const response = await api.post('/api/products', data);
    return response.data.data;
  },

  async updateProduct(id, data) {
    const response = await api.put(`/api/products/${id}`, data);
    return response.data.data;
  },

  async deleteProduct(id) {
    const response = await api.delete(`/api/products/${id}`);
    return response.data.data;
  },

  async searchProducts(query) {
    const response = await api.get('/api/products/search', { params: { q: query } });
    return response.data.data;
  },

  async getProductFamilies() {
    const response = await api.get('/api/products/families');
    return response.data.data;
  },
};

// Quotes API
export const quotesApi = {
  async getQuotes(params = {}) {
    const response = await api.get('/api/quotes', { params });
    return response.data;
  },

  async getQuote(id) {
    const response = await api.get(`/api/quotes/${id}`);
    return response.data;
  },

  async createQuote(data) {
    const response = await api.post('/api/quotes', data);
    return response.data;
  },

  async updateQuote(id, data) {
    const response = await api.put(`/api/quotes/${id}`, data);
    return response.data;
  },

  async deleteQuote(id) {
    const response = await api.delete(`/api/quotes/${id}`);
    return response.data;
  },

  async getQuotesByOpportunity(opportunityId) {
    const response = await api.get(`/api/quotes/opportunity/${opportunityId}`);
    return response.data;
  },

  async addLineItem(quoteId, data) {
    const response = await api.post(`/api/quotes/${quoteId}/line-items`, data);
    return response.data;
  },

  async deleteLineItem(quoteId, lineId) {
    const response = await api.delete(`/api/quotes/${quoteId}/line-items/${lineId}`);
    return response.data;
  },

  async acceptQuote(quoteId) {
    const response = await api.post(`/api/quotes/${quoteId}/accept`);
    return response.data;
  },

  async cloneQuote(quoteId, data = {}) {
    const response = await api.post(`/api/quotes/${quoteId}/clone`, data);
    return response.data;
  },
};

// Invoices API
export const invoicesApi = {
  async getInvoices(params = {}) {
    const response = await api.get('/api/invoices', { params });
    return response.data;
  },

  async getInvoice(id) {
    const response = await api.get(`/api/invoices/${id}`);
    return response.data;
  },

  async createInvoice(data) {
    const response = await api.post('/api/invoices', data);
    return response.data;
  },

  async updateInvoice(id, data) {
    const response = await api.put(`/api/invoices/${id}`, data);
    return response.data;
  },

  async deleteInvoice(id) {
    const response = await api.delete(`/api/invoices/${id}`);
    return response.data;
  },

  async getInvoicesByAccount(accountId) {
    const response = await api.get(`/api/invoices/account/${accountId}`);
    return response.data;
  },

  async getInvoiceStats() {
    const response = await api.get('/api/invoices/stats');
    return response.data;
  },

  async sendInvoice(id) {
    const response = await api.post(`/api/invoices/${id}/send`);
    return response.data;
  },

  async voidInvoice(id) {
    const response = await api.post(`/api/invoices/${id}/void`);
    return response.data;
  },

  async applyLateFee(id, data) {
    const response = await api.post(`/api/invoices/${id}/late-fee`, data);
    return response.data;
  },
};

// Work Orders API
export const workOrdersApi = {
  async getWorkOrders(params = {}) {
    const response = await api.get('/api/work-orders', { params });
    return response.data;
  },

  async getWorkOrder(id) {
    const response = await api.get(`/api/work-orders/${id}`);
    return response.data;
  },

  async createWorkOrder(data) {
    const response = await api.post('/api/work-orders', data);
    return response.data;
  },

  async updateWorkOrder(id, data) {
    const response = await api.put(`/api/work-orders/${id}`, data);
    return response.data;
  },

  async deleteWorkOrder(id) {
    const response = await api.delete(`/api/work-orders/${id}`);
    return response.data;
  },

  async getWorkOrdersByOpportunity(opportunityId, params = {}) {
    const response = await api.get(`/api/work-orders/opportunity/${opportunityId}`, { params });
    return response.data;
  },

  async getWorkOrderStats(params = {}) {
    const response = await api.get('/api/work-orders/stats', { params });
    return response.data;
  },

  async getWorkTypes() {
    const response = await api.get('/api/work-orders/types');
    return response.data;
  },

  // Service Appointments
  async getServiceAppointments(params = {}) {
    const response = await api.get('/api/service-appointments', { params });
    return response.data;
  },

  async getServiceAppointment(id) {
    const response = await api.get(`/api/service-appointments/${id}`);
    return response.data;
  },

  async createServiceAppointment(data) {
    const response = await api.post('/api/service-appointments', data);
    return response.data;
  },

  async updateServiceAppointment(id, data) {
    const response = await api.put(`/api/service-appointments/${id}`, data);
    return response.data;
  },

  async deleteServiceAppointment(id) {
    const response = await api.delete(`/api/service-appointments/${id}`);
    return response.data;
  },
};

// Cases API
export const casesApi = {
  async getCases(params = {}) {
    const response = await api.get('/api/cases', { params });
    return response.data;
  },

  async getCase(id) {
    const response = await api.get(`/api/cases/${id}`);
    return response.data;
  },

  async createCase(data) {
    const response = await api.post('/api/cases', data);
    return response.data;
  },

  async updateCase(id, data) {
    const response = await api.put(`/api/cases/${id}`, data);
    return response.data;
  },

  async deleteCase(id) {
    const response = await api.delete(`/api/cases/${id}`);
    return response.data;
  },

  async getCasesByAccount(accountId, params = {}) {
    const response = await api.get(`/api/cases/account/${accountId}`, { params });
    return response.data;
  },

  async getCasesByOpportunity(opportunityId, params = {}) {
    const response = await api.get(`/api/cases/opportunity/${opportunityId}`, { params });
    return response.data;
  },

  async getCaseStats(params = {}) {
    const response = await api.get('/api/cases/stats', { params });
    return response.data;
  },

  async escalateCase(id, data = {}) {
    const response = await api.post(`/api/cases/${id}/escalate`, data);
    return response.data;
  },

  async closeCase(id, data = {}) {
    const response = await api.post(`/api/cases/${id}/close`, data);
    return response.data;
  },

  async reopenCase(id) {
    const response = await api.post(`/api/cases/${id}/reopen`);
    return response.data;
  },

  async getCaseComments(id) {
    const response = await api.get(`/api/cases/${id}/comments`);
    return response.data;
  },

  async addCaseComment(id, data) {
    const response = await api.post(`/api/cases/${id}/comments`, data);
    return response.data;
  },
};

// Emails API
export const emailsApi = {
  async getEmails(params = {}) {
    const response = await api.get('/api/emails', { params });
    return response.data;
  },

  async getEmail(id) {
    const response = await api.get(`/api/emails/${id}`);
    return response.data;
  },

  async createEmail(data) {
    const response = await api.post('/api/emails', data);
    return response.data;
  },

  async updateEmail(id, data) {
    const response = await api.put(`/api/emails/${id}`, data);
    return response.data;
  },

  async deleteEmail(id) {
    const response = await api.delete(`/api/emails/${id}`);
    return response.data;
  },

  async sendEmail(id) {
    const response = await api.post(`/api/emails/${id}/send`);
    return response.data;
  },

  async replyToEmail(id, data) {
    const response = await api.post(`/api/emails/${id}/reply`, data);
    return response.data;
  },

  async forwardEmail(id, data) {
    const response = await api.post(`/api/emails/${id}/forward`, data);
    return response.data;
  },

  async getEmailsByContact(contactId, params = {}) {
    const response = await api.get(`/api/emails/contact/${contactId}`, { params });
    return response.data;
  },

  async getEmailsByOpportunity(opportunityId, params = {}) {
    const response = await api.get(`/api/emails/opportunity/${opportunityId}`, { params });
    return response.data;
  },

  async getEmailThread(threadId) {
    const response = await api.get(`/api/emails/thread/${threadId}`);
    return response.data;
  },

  async getEmailStats(params = {}) {
    const response = await api.get('/api/emails/stats', { params });
    return response.data;
  },
};

// Notifications API
export const notificationsApi = {
  async getNotifications(params = {}) {
    const response = await api.get('/api/notifications', { params });
    return response.data;
  },

  async getNotification(id) {
    const response = await api.get(`/api/notifications/${id}`);
    return response.data;
  },

  async getUnreadCount(userId) {
    const response = await api.get('/api/notifications/unread-count', {
      params: { userId },
    });
    return response.data;
  },

  async getNotificationsByOpportunity(opportunityId, params = {}) {
    const response = await api.get(`/api/notifications/opportunity/${opportunityId}`, { params });
    return response.data;
  },

  async markAsRead(id) {
    const response = await api.post(`/api/notifications/${id}/read`);
    return response.data;
  },

  async markAllAsRead(userId) {
    const response = await api.post('/api/notifications/mark-all-read', { userId });
    return response.data;
  },

  async archiveNotification(id) {
    const response = await api.post(`/api/notifications/${id}/archive`);
    return response.data;
  },

  async deleteNotification(id) {
    const response = await api.delete(`/api/notifications/${id}`);
    return response.data;
  },

  async bulkUpdateStatus(ids, status) {
    const response = await api.post('/api/notifications/bulk-status', { ids, status });
    return response.data;
  },

  // Preferences
  async getPreferences(userId) {
    const response = await api.get(`/api/notification-preferences/${userId}`);
    return response.data;
  },

  async updatePreferences(userId, data) {
    const response = await api.put(`/api/notification-preferences/${userId}`, data);
    return response.data;
  },

  async resetPreferences(userId) {
    const response = await api.post(`/api/notification-preferences/${userId}/reset`);
    return response.data;
  },

  // Templates (admin)
  async getTemplates() {
    const response = await api.get('/api/notification-templates');
    return response.data;
  },

  async getTemplate(type) {
    const response = await api.get(`/api/notification-templates/${type}`);
    return response.data;
  },

  async updateTemplate(type, data) {
    const response = await api.put(`/api/notification-templates/${type}`, data);
    return response.data;
  },
};

// Users API
export const usersApi = {
  async getUsers(params = {}) {
    const response = await api.get('/api/users', { params });
    return response.data;
  },

  async getUser(id) {
    const response = await api.get(`/api/users/${id}`);
    return response.data.data;
  },

  async getUserByEmail(email) {
    const response = await api.get(`/api/users/email/${encodeURIComponent(email)}`);
    return response.data.data;
  },

  async updateUser(id, data) {
    const response = await api.put(`/api/users/${id}`, data);
    return response.data.data;
  },

  async searchUsers(query) {
    const response = await api.get('/api/users/search', { params: { q: query } });
    return response.data.data;
  },

  async getUsersForDropdown(params = {}) {
    const response = await api.get('/api/users/dropdown', { params });
    return response.data.data;
  },

  async getUserStats() {
    const response = await api.get('/api/users/stats');
    return response.data.data;
  },

  async getDirectReports(id) {
    const response = await api.get(`/api/users/${id}/direct-reports`);
    return response.data.data;
  },
};

// Roles API
export const rolesApi = {
  async getRoles() {
    const response = await api.get('/api/permissions/roles');
    return response.data.data;
  },

  async getRole(id) {
    const response = await api.get(`/api/permissions/roles/${id}`);
    return response.data.data;
  },

  async createRole(data) {
    const response = await api.post('/api/permissions/roles', data);
    return response.data.data;
  },

  async updateRole(id, data) {
    const response = await api.put(`/api/permissions/roles/${id}`, data);
    return response.data.data;
  },

  async deleteRole(id) {
    const response = await api.delete(`/api/permissions/roles/${id}`);
    return response.data;
  },

  async assignRoleToUser(userId, roleId) {
    const response = await api.post('/api/permissions/assign', { userId, roleId });
    return response.data.data;
  },

  async getResources() {
    const response = await api.get('/api/permissions/resources');
    return response.data.data;
  },
};

// Commissions API
export const commissionsApi = {
  async getCommissions(params = {}) {
    const response = await api.get('/api/commissions', { params });
    return response.data;
  },

  async getCommission(id) {
    const response = await api.get(`/api/commissions/${id}`);
    return response.data.data;
  },

  async createCommission(data) {
    const response = await api.post('/api/commissions', data);
    return response.data.data;
  },

  async updateCommission(id, data) {
    const response = await api.put(`/api/commissions/${id}`, data);
    return response.data.data;
  },

  async updateStatus(id, status, notes, reason) {
    const response = await api.patch(`/api/commissions/${id}/status`, { status, notes, reason });
    return response.data.data;
  },

  async bulkUpdateStatus(commissionIds, status, notes, reason) {
    const response = await api.post('/api/commissions/bulk-status', { commissionIds, status, notes, reason });
    return response.data.data;
  },

  async deleteCommission(id) {
    const response = await api.delete(`/api/commissions/${id}`);
    return response.data.data;
  },

  async getSummary(params = {}) {
    const response = await api.get('/api/commissions/summary', { params });
    return response.data.data;
  },

  async getStats(params = {}) {
    const response = await api.get('/api/commissions/stats', { params });
    return response.data.data;
  },

  async getUserCommissions(userId, params = {}) {
    const response = await api.get(`/api/commissions/user/${userId}`, { params });
    return response.data;
  },

  async getUserProfile(userId) {
    const response = await api.get(`/api/commissions/user/${userId}/profile`);
    return response.data.data;
  },

  async getOpportunityCommissions(opportunityId) {
    const response = await api.get(`/api/commissions/opportunity/${opportunityId}`);
    return response.data.data;
  },

  async calculateCommission(userId, type, value) {
    const response = await api.post('/api/commissions/calculate', { userId, type, value });
    return response.data.data;
  },

  // Commission Rules
  async getRules(includeInactive = false) {
    const response = await api.get('/api/commissions/rules', { params: { includeInactive } });
    return response.data.data;
  },

  async getRule(id) {
    const response = await api.get(`/api/commissions/rules/${id}`);
    return response.data.data;
  },

  async createRule(data) {
    const response = await api.post('/api/commissions/rules', data);
    return response.data.data;
  },

  async updateRule(id, data) {
    const response = await api.put(`/api/commissions/rules/${id}`, data);
    return response.data.data;
  },

  async deleteRule(id) {
    const response = await api.delete(`/api/commissions/rules/${id}`);
    return response.data.data;
  },

  async toggleRuleStatus(id) {
    const response = await api.post(`/api/commissions/rules/${id}/toggle`);
    return response.data.data;
  },

  async seedDefaultRules() {
    const response = await api.post('/api/commissions/rules/seed');
    return response.data.data;
  },

  async getRuleTypes() {
    const response = await api.get('/api/commissions/rules/meta/types');
    return response.data.data;
  },
};

// Approvals API
export const approvalsApi = {
  // Get approvals with filters
  async getApprovals(params = {}) {
    const response = await api.get('/api/workflows/approvals', { params });
    return response.data;
  },

  // Get approvals pending for current user
  async getPending(userId) {
    const response = await api.get('/api/workflows/approvals/pending', {
      params: { userId },
    });
    return response.data;
  },

  // Get approvals submitted by current user
  async getSubmitted(userId) {
    const response = await api.get('/api/workflows/approvals/submitted', {
      params: { userId },
    });
    return response.data;
  },

  // Get approval statistics
  async getStats(userId = null) {
    const response = await api.get('/api/workflows/approvals/stats', {
      params: userId ? { userId } : {},
    });
    return response.data.data;
  },

  // Get single approval request
  async getApproval(id) {
    const response = await api.get(`/api/workflows/approvals/${id}`);
    return response.data.data;
  },

  // Create new approval request
  async createApproval(data) {
    const response = await api.post('/api/workflows/approvals', data);
    return response.data.data;
  },

  // Submit a decision
  async decide(id, { decision, decisionReason, decisionNotes, decidedById }) {
    const response = await api.post(`/api/workflows/approvals/${id}/decide`, {
      decision,
      decisionReason,
      decisionNotes,
      decidedById,
    });
    return response.data.data;
  },

  // Approve shorthand
  async approve(id, { reason, notes, decidedById }) {
    return this.decide(id, {
      decision: 'APPROVE',
      decisionReason: reason,
      decisionNotes: notes,
      decidedById,
    });
  },

  // Reject shorthand
  async reject(id, { reason, notes, decidedById }) {
    return this.decide(id, {
      decision: 'REJECT',
      decisionReason: reason,
      decisionNotes: notes,
      decidedById,
    });
  },

  // Add comment to approval
  async addComment(id, { content, authorId, isInternal = false }) {
    const response = await api.post(`/api/workflows/approvals/${id}/comments`, {
      content,
      authorId,
      isInternal,
    });
    return response.data.data;
  },

  // Cancel an approval request
  async cancel(id, requesterId) {
    const response = await api.post(`/api/workflows/approvals/${id}/cancel`, {
      requesterId,
    });
    return response.data.data;
  },

  // Escalate an approval request
  async escalate(id, { escalateToId, escalationReason, escalatedById }) {
    const response = await api.post(`/api/workflows/approvals/${id}/escalate`, {
      escalateToId,
      escalationReason,
      escalatedById,
    });
    return response.data.data;
  },

  // Approval Rules
  async getRules(activeOnly = false) {
    const response = await api.get('/api/workflows/approvals/rules/list', {
      params: { active: activeOnly },
    });
    return response.data.data;
  },

  async createRule(data) {
    const response = await api.post('/api/workflows/approvals/rules', data);
    return response.data.data;
  },

  async updateRule(id, data) {
    const response = await api.put(`/api/workflows/approvals/rules/${id}`, data);
    return response.data.data;
  },

  async deleteRule(id) {
    const response = await api.delete(`/api/workflows/approvals/rules/${id}`);
    return response.data;
  },
};

// Schedule / Field Service API
export const scheduleApi = {
  // Work Orders
  async getWorkOrders(params = {}) {
    const response = await api.get('/api/work-orders', { params });
    return response.data;
  },

  async getWorkOrder(id) {
    const response = await api.get(`/api/work-orders/${id}`);
    return response.data.data;
  },

  async createWorkOrder(data) {
    const response = await api.post('/api/work-orders', data);
    return response.data.data;
  },

  async updateWorkOrder(id, data) {
    const response = await api.put(`/api/work-orders/${id}`, data);
    return response.data.data;
  },

  async deleteWorkOrder(id) {
    const response = await api.delete(`/api/work-orders/${id}`);
    return response.data.data;
  },

  // Service Appointments
  async getServiceAppointments(params = {}) {
    const response = await api.get('/api/service-appointments', { params });
    return response.data;
  },

  async getServiceAppointment(id) {
    const response = await api.get(`/api/service-appointments/${id}`);
    return response.data.data;
  },

  async createServiceAppointment(data) {
    const response = await api.post('/api/service-appointments', data);
    return response.data.data;
  },

  async updateServiceAppointment(id, data) {
    const response = await api.put(`/api/service-appointments/${id}`, data);
    return response.data.data;
  },

  async updateAppointmentStatus(id, status) {
    const response = await api.patch(`/api/service-appointments/${id}/status`, { status });
    return response.data.data;
  },

  async deleteServiceAppointment(id) {
    const response = await api.delete(`/api/service-appointments/${id}`);
    return response.data.data;
  },

  // Resources
  async getResources(params = {}) {
    const response = await api.get('/api/resources', { params });
    return response.data;
  },

  async getResource(id) {
    const response = await api.get(`/api/resources/${id}`);
    return response.data.data;
  },

  async createResource(data) {
    const response = await api.post('/api/resources', data);
    return response.data.data;
  },

  async updateResource(id, data) {
    const response = await api.put(`/api/resources/${id}`, data);
    return response.data.data;
  },

  async deleteResource(id) {
    const response = await api.delete(`/api/resources/${id}`);
    return response.data.data;
  },

  async getResourceAbsences(resourceId) {
    const response = await api.get(`/api/resources/${resourceId}/absences`);
    return response.data.data;
  },

  async addResourceAbsence(resourceId, data) {
    const response = await api.post(`/api/resources/${resourceId}/absences`, data);
    return response.data.data;
  },

  async getResourceSkills(resourceId) {
    const response = await api.get(`/api/resources/${resourceId}/skills`);
    return response.data.data;
  },

  // Scheduling
  async autoScheduleAppointment(data) {
    const response = await api.post('/api/scheduling/auto-schedule', data);
    return response.data;
  },

  async findAvailableSlots(data) {
    const response = await api.post('/api/scheduling/find-slots', data);
    return response.data;
  },

  async getDispatchBoard(params = {}) {
    const response = await api.get('/api/scheduling/dispatch-board', { params });
    return response.data;
  },

  async optimizeSchedule(data) {
    const response = await api.post('/api/scheduling/optimize', data);
    return response.data;
  },

  // Territories
  async getTerritories(params = {}) {
    const response = await api.get('/api/resources/territories', { params });
    return response.data;
  },

  async getTerritory(id) {
    const response = await api.get(`/api/resources/territories/${id}`);
    return response.data.data;
  },

  // Work Types
  async getWorkTypes() {
    const response = await api.get('/api/work-orders/types');
    return response.data.data;
  },

  // Google Calendar Integration
  async getGoogleAuthUrl(resourceId) {
    const response = await api.get('/api/integrations/google/auth', {
      params: { serviceResourceId: resourceId },
    });
    return response.data.data;
  },

  async disconnectGoogleCalendar(resourceId) {
    const response = await api.delete(`/api/integrations/google/${resourceId}`);
    return response.data.data;
  },

  async syncToGoogleCalendar(resourceId) {
    const response = await api.post(`/api/integrations/google/sync/${resourceId}`);
    return response.data.data;
  },

  async getGoogleCalendarStatus(resourceId) {
    const response = await api.get(`/api/integrations/google/status/${resourceId}`);
    return response.data.data;
  },

  async toggleGoogleCalendarSync(resourceId, enabled) {
    const response = await api.post(`/api/integrations/google/toggle/${resourceId}`, { enabled });
    return response.data.data;
  },

  async getGoogleCalendarAvailability(resourceId, params = {}) {
    const response = await api.get(`/api/integrations/google/availability/${resourceId}`, { params });
    return response.data.data;
  },

  // Assign Resource to Appointment
  async assignResource(appointmentId, resourceId, isPrimary = false) {
    const response = await api.post(`/api/service-appointments/${appointmentId}/assign`, {
      resourceId,
      isPrimary,
    });
    return response.data.data;
  },

  async unassignResource(appointmentId, resourceId) {
    const response = await api.delete(`/api/service-appointments/${appointmentId}/assign/${resourceId}`);
    return response.data.data;
  },

  // ====== MATERIAL ORDERS (AccuLynx-style W/O/D) ======
  async getMaterialOrders(params = {}) {
    const response = await api.get('/api/material-orders', { params });
    return response.data;
  },

  async getMaterialOrderCounts() {
    const response = await api.get('/api/material-orders/counts');
    return response.data;
  },

  async getMaterialOrder(id) {
    const response = await api.get(`/api/material-orders/${id}`);
    return response.data;
  },

  async createMaterialOrder(data) {
    const response = await api.post('/api/material-orders', data);
    return response.data;
  },

  async updateMaterialOrder(id, data) {
    const response = await api.put(`/api/material-orders/${id}`, data);
    return response.data;
  },

  async updateMaterialOrderStatus(id, status, additionalData = {}) {
    const response = await api.patch(`/api/material-orders/${id}/status`, { status, ...additionalData });
    return response.data;
  },

  async bulkUpdateMaterialOrderStatus(ids, status, additionalData = {}) {
    const response = await api.post('/api/material-orders/bulk-status', { ids, status, ...additionalData });
    return response.data;
  },

  async deleteMaterialOrder(id) {
    const response = await api.delete(`/api/material-orders/${id}`);
    return response.data;
  },

  async submitToAbcSupply(id) {
    const response = await api.post(`/api/material-orders/${id}/submit-abc`);
    return response.data;
  },

  async getMaterialOrdersForCalendar(startDate, endDate) {
    const response = await api.get('/api/material-orders/calendar', {
      params: { startDate, endDate },
    });
    return response.data;
  },

  // Suppliers
  async getSuppliers() {
    const response = await api.get('/api/material-orders/suppliers');
    return response.data;
  },

  async saveSupplier(data) {
    const response = await api.post('/api/material-orders/suppliers', data);
    return response.data;
  },
};

// Payments & Invoicing API
export const paymentsApi = {
  // === INVOICES ===
  async getInvoices(params = {}) {
    const response = await api.get('/api/invoices', { params });
    return response.data;
  },

  async getInvoice(id) {
    const response = await api.get(`/api/invoices/${id}`);
    return response.data.data;
  },

  async createInvoice(data) {
    const response = await api.post('/api/invoices', data);
    return response.data.data;
  },

  async updateInvoice(id, data) {
    const response = await api.put(`/api/invoices/${id}`, data);
    return response.data.data;
  },

  async deleteInvoice(id) {
    const response = await api.delete(`/api/invoices/${id}`);
    return response.data.data;
  },

  async sendInvoice(id) {
    const response = await api.post(`/api/invoices/${id}/send`);
    return response.data.data;
  },

  async voidInvoice(id) {
    const response = await api.post(`/api/invoices/${id}/void`);
    return response.data.data;
  },

  async applyLateFee(id, amount) {
    const response = await api.post(`/api/invoices/${id}/late-fee`, { amount });
    return response.data.data;
  },

  async getInvoiceStats() {
    const response = await api.get('/api/invoices/stats');
    return response.data.data;
  },

  async getInvoicesByAccount(accountId) {
    const response = await api.get(`/api/invoices/account/${accountId}`);
    return response.data;
  },

  // === PAYMENTS ===
  async getPayments(params = {}) {
    const response = await api.get('/api/payments', { params });
    return response.data;
  },

  async getPayment(id) {
    const response = await api.get(`/api/payments/${id}`);
    return response.data.data;
  },

  async createPayment(data) {
    const response = await api.post('/api/payments', data);
    return response.data.data;
  },

  async updatePayment(id, data) {
    const response = await api.put(`/api/payments/${id}`, data);
    return response.data.data;
  },

  async deletePayment(id) {
    const response = await api.delete(`/api/payments/${id}`);
    return response.data.data;
  },

  async refundPayment(id, amount, reason) {
    const response = await api.post(`/api/payments/${id}/refund`, { amount, reason });
    return response.data.data;
  },

  async getPaymentStats() {
    const response = await api.get('/api/payments/stats');
    return response.data.data;
  },

  async getPaymentsByInvoice(invoiceId) {
    const response = await api.get(`/api/payments/invoice/${invoiceId}`);
    return response.data;
  },

  // === STRIPE ===
  async createPaymentIntent(data) {
    const response = await api.post('/api/payments/intent', data);
    return response.data.data;
  },

  async getPaymentIntent(paymentIntentId) {
    const response = await api.get(`/api/payments/intent/${paymentIntentId}`);
    return response.data.data;
  },

  async cancelPaymentIntent(paymentIntentId) {
    const response = await api.post(`/api/payments/intent/${paymentIntentId}/cancel`);
    return response.data.data;
  },

  async createPaymentLink(data) {
    const response = await api.post('/api/payment-links', data);
    return response.data.data;
  },

  async getPaymentLinks(accountId) {
    const response = await api.get(`/api/payment-links/account/${accountId}`);
    return response.data;
  },

  async deactivatePaymentLink(id) {
    const response = await api.post(`/api/payment-links/${id}/deactivate`);
    return response.data.data;
  },

  // === QUICKBOOKS ===
  async getQuickBooksStatus() {
    const response = await api.get('/api/quickbooks/status');
    return response.data;
  },

  async getQuickBooksAuthUrl() {
    const response = await api.get('/api/quickbooks/oauth/authorize');
    return response.data;
  },

  async syncCustomerToQB(accountId) {
    const response = await api.post(`/api/quickbooks/sync/customer/${accountId}`);
    return response.data.data;
  },

  async syncInvoiceToQB(invoiceId) {
    const response = await api.post(`/api/quickbooks/sync/invoice/${invoiceId}`);
    return response.data.data;
  },

  async syncPaymentToQB(paymentId) {
    const response = await api.post('/api/quickbooks/sync/payment', { paymentId });
    return response.data.data;
  },

  async getQBCustomerBalance() {
    const response = await api.get('/api/quickbooks/reports/customer-balance');
    return response.data.data;
  },

  async getQBProfitLoss(startDate, endDate) {
    const response = await api.get('/api/quickbooks/reports/profit-loss', {
      params: { startDate, endDate },
    });
    return response.data.data;
  },

  async getQBItems() {
    const response = await api.get('/api/quickbooks/items');
    return response.data.data;
  },

  async sendQBInvoice(qbInvoiceId) {
    const response = await api.post(`/api/quickbooks/invoice/${qbInvoiceId}/send`);
    return response.data.data;
  },

  async getQBInvoicePdf(qbInvoiceId) {
    const response = await api.get(`/api/quickbooks/invoice/${qbInvoiceId}/pdf`);
    return response.data;
  },
};

// ==========================================
// FIELD SERVICE API
// ==========================================
export const fieldServiceApi = {
  // === TERRITORIES ===
  async getTerritories(params = {}) {
    const response = await api.get('/api/field-service/territories', { params });
    return response.data;
  },

  async getTerritory(id) {
    const response = await api.get(`/api/field-service/territories/${id}`);
    return response.data;
  },

  async createTerritory(data) {
    const response = await api.post('/api/field-service/territories', data);
    return response.data;
  },

  async updateTerritory(id, data) {
    const response = await api.put(`/api/field-service/territories/${id}`, data);
    return response.data;
  },

  async deleteTerritory(id) {
    const response = await api.delete(`/api/field-service/territories/${id}`);
    return response.data;
  },

  // === OPERATING HOURS ===
  async getOperatingHours(params = {}) {
    const response = await api.get('/api/field-service/operating-hours', { params });
    return response.data;
  },

  async getOperatingHoursById(id) {
    const response = await api.get(`/api/field-service/operating-hours/${id}`);
    return response.data;
  },

  async createOperatingHours(data) {
    const response = await api.post('/api/field-service/operating-hours', data);
    return response.data;
  },

  async updateOperatingHours(id, data) {
    const response = await api.put(`/api/field-service/operating-hours/${id}`, data);
    return response.data;
  },

  // === WORK TYPES ===
  async getWorkTypes(params = {}) {
    const response = await api.get('/api/field-service/work-types', { params });
    return response.data;
  },

  async getWorkType(id) {
    const response = await api.get(`/api/field-service/work-types/${id}`);
    return response.data;
  },

  async createWorkType(data) {
    const response = await api.post('/api/field-service/work-types', data);
    return response.data;
  },

  async updateWorkType(id, data) {
    const response = await api.put(`/api/field-service/work-types/${id}`, data);
    return response.data;
  },

  // === SERVICE RESOURCES ===
  async getServiceResources(params = {}) {
    const response = await api.get('/api/field-service/resources', { params });
    return response.data;
  },

  async getServiceResource(id) {
    const response = await api.get(`/api/field-service/resources/${id}`);
    return response.data;
  },

  async createServiceResource(data) {
    const response = await api.post('/api/field-service/resources', data);
    return response.data;
  },

  async updateServiceResource(id, data) {
    const response = await api.put(`/api/field-service/resources/${id}`, data);
    return response.data;
  },

  async getResourceTerritories(resourceId) {
    const response = await api.get(`/api/field-service/resources/${resourceId}/territories`);
    return response.data;
  },

  async assignResourceToTerritory(resourceId, territoryId, data = {}) {
    const response = await api.post(`/api/field-service/resources/${resourceId}/territories`, {
      territoryId,
      ...data,
    });
    return response.data;
  },

  async removeResourceFromTerritory(resourceId, membershipId) {
    const response = await api.delete(`/api/field-service/resources/${resourceId}/territories/${membershipId}`);
    return response.data;
  },

  // === SCHEDULING POLICIES ===
  async getSchedulingPolicies(params = {}) {
    const response = await api.get('/api/field-service/scheduling-policies', { params });
    return response.data;
  },

  async getSchedulingPolicy(id) {
    const response = await api.get(`/api/field-service/scheduling-policies/${id}`);
    return response.data;
  },

  async createSchedulingPolicy(data) {
    const response = await api.post('/api/field-service/scheduling-policies', data);
    return response.data;
  },

  async updateSchedulingPolicy(id, data) {
    const response = await api.put(`/api/field-service/scheduling-policies/${id}`, data);
    return response.data;
  },

  async getPolicyWorkRules(policyId) {
    const response = await api.get(`/api/field-service/scheduling-policies/${policyId}/work-rules`);
    return response.data;
  },

  // === WORK RULES ===
  async getWorkRules(params = {}) {
    const response = await api.get('/api/field-service/work-rules', { params });
    return response.data;
  },

  async getWorkRule(id) {
    const response = await api.get(`/api/field-service/work-rules/${id}`);
    return response.data;
  },

  // === SERVICE OBJECTIVES ===
  async getServiceObjectives(params = {}) {
    const response = await api.get('/api/field-service/objectives', { params });
    return response.data;
  },

  async getServiceObjective(id) {
    const response = await api.get(`/api/field-service/objectives/${id}`);
    return response.data;
  },

  // === SKILLS ===
  async getSkills(params = {}) {
    const response = await api.get('/api/field-service/skills', { params });
    return response.data;
  },

  async getSkill(id) {
    const response = await api.get(`/api/field-service/skills/${id}`);
    return response.data;
  },

  async createSkill(data) {
    const response = await api.post('/api/field-service/skills', data);
    return response.data;
  },

  async updateSkill(id, data) {
    const response = await api.put(`/api/field-service/skills/${id}`, data);
    return response.data;
  },

  async getResourceSkills(resourceId) {
    const response = await api.get(`/api/field-service/resources/${resourceId}/skills`);
    return response.data;
  },

  async assignSkillToResource(resourceId, skillId, data = {}) {
    const response = await api.post(`/api/field-service/resources/${resourceId}/skills`, {
      skillId,
      ...data,
    });
    return response.data;
  },

  // === SERVICE APPOINTMENTS ===
  async getServiceAppointments(params = {}) {
    const response = await api.get('/api/field-service/appointments', { params });
    return response.data;
  },

  async getServiceAppointment(id) {
    const response = await api.get(`/api/field-service/appointments/${id}`);
    return response.data;
  },

  async updateServiceAppointment(id, data) {
    const response = await api.put(`/api/field-service/appointments/${id}`, data);
    return response.data;
  },

  async scheduleAppointment(id, data) {
    const response = await api.post(`/api/field-service/appointments/${id}/schedule`, data);
    return response.data;
  },

  async dispatchAppointment(id, resourceId) {
    const response = await api.post(`/api/field-service/appointments/${id}/dispatch`, { resourceId });
    return response.data;
  },

  // === SYNC ===
  async syncFromSalesforce(objectType) {
    const response = await api.post('/api/field-service/sync', { objectType });
    return response.data;
  },

  async getLastSyncStatus() {
    const response = await api.get('/api/field-service/sync/status');
    return response.data;
  },
};

// Reports & Analytics API
export const reportsApi = {
  // Analytics endpoints
  async getPipelineMetrics(dateRange = {}, options = {}) {
    const response = await api.get('/api/analytics/pipeline', {
      params: { ...dateRange, ...options },
    });
    return response.data;
  },

  async getTimeSeriesData(options = {}) {
    const response = await api.get('/api/analytics/time-series', { params: options });
    return response.data;
  },

  async getRevenueMetrics(dateRange = {}, options = {}) {
    const response = await api.get('/api/analytics/revenue', {
      params: { ...dateRange, ...options },
    });
    return response.data;
  },

  async getPerformanceMetrics(dateRange = {}, options = {}) {
    const response = await api.get('/api/analytics/performance', {
      params: { ...dateRange, ...options },
    });
    return response.data;
  },

  async getLeadMetrics(dateRange = {}, options = {}) {
    const response = await api.get('/api/analytics/leads', {
      params: { ...dateRange, ...options },
    });
    return response.data;
  },

  // Saved reports
  async getSavedReports(params = {}) {
    const response = await api.get('/api/reports', { params });
    return response.data;
  },

  async getSavedReport(id) {
    const response = await api.get(`/api/reports/${id}`);
    return response.data.data;
  },

  async createReport(data) {
    const response = await api.post('/api/reports', data);
    return response.data.data;
  },

  async updateReport(id, data) {
    const response = await api.put(`/api/reports/${id}`, data);
    return response.data.data;
  },

  async deleteReport(id) {
    const response = await api.delete(`/api/reports/${id}`);
    return response.data;
  },

  async runReport(id, params = {}) {
    const response = await api.post(`/api/reports/${id}/run`, params);
    return response.data;
  },

  async toggleFavorite(id) {
    const response = await api.post(`/api/reports/${id}/favorite`);
    return response.data;
  },

  async exportReport(id, format = 'csv') {
    const response = await api.get(`/api/reports/${id}/export`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  },

  // Dashboards - gracefully handle when backend not deployed yet
  async getDashboards() {
    try {
      const response = await api.get('/api/dashboards');
      return response.data;
    } catch (error) {
      // Return empty data if API not available
      console.warn('Dashboards API not available, using placeholder data');
      return { success: true, data: [] };
    }
  },

  async getDashboard(id) {
    try {
      const response = await api.get(`/api/dashboards/${id}`);
      return response.data.data;
    } catch (error) {
      // Return null if API not available
      console.warn('Dashboard API not available');
      return null;
    }
  },

  async createDashboard(data) {
    const response = await api.post('/api/dashboards', data);
    return response.data.data;
  },

  async updateDashboard(id, data) {
    const response = await api.put(`/api/dashboards/${id}`, data);
    return response.data.data;
  },

  async deleteDashboard(id) {
    const response = await api.delete(`/api/dashboards/${id}`);
    return response.data;
  },
};

// Google Calendar API
export const googleCalendarApi = {
  // Get OAuth authorization URL
  async getAuthUrl(serviceResourceId) {
    const response = await api.get('/api/integrations/google/auth', {
      params: { serviceResourceId },
    });
    return response.data.data;
  },

  // Get sync status for a crew member
  async getSyncStatus(serviceResourceId) {
    const response = await api.get(`/api/integrations/google/status/${serviceResourceId}`);
    return response.data.data;
  },

  // Trigger sync for a crew member
  async syncCalendar(serviceResourceId) {
    const response = await api.post(`/api/integrations/google/sync/${serviceResourceId}`);
    return response.data.data;
  },

  // Get available time slots
  async getAvailability(serviceResourceId, params = {}) {
    const response = await api.get(`/api/integrations/google/availability/${serviceResourceId}`, {
      params,
    });
    return response.data.data;
  },

  // Toggle sync enabled/disabled
  async toggleSync(serviceResourceId, enabled) {
    const response = await api.post(`/api/integrations/google/toggle/${serviceResourceId}`, {
      enabled,
    });
    return response.data.data;
  },

  // Disconnect Google Calendar
  async disconnect(serviceResourceId) {
    const response = await api.delete(`/api/integrations/google/${serviceResourceId}`);
    return response.data.data;
  },
};

// Measurements API (EagleView, GAF QuickMeasure & Hover)
export const measurementsApi = {
  // GAF QuickMeasure
  async orderGAFReport(data) {
    const response = await api.post('/api/integrations/measurements/gaf/order', data);
    return response.data;
  },

  async getGAFReportStatus(reportId) {
    const response = await api.get(`/api/integrations/measurements/gaf/${reportId}/status`);
    return response.data;
  },

  // EagleView
  async orderEagleViewReport(data) {
    const response = await api.post('/api/integrations/measurements/eagleview/order', data);
    return response.data;
  },

  async getEagleViewReportStatus(reportId) {
    const response = await api.get(`/api/integrations/measurements/eagleview/${reportId}/status`);
    return response.data;
  },

  // Hover 3D Modeling
  async checkHoverStatus() {
    const response = await api.get('/api/integrations/measurements/hover/status');
    return response.data;
  },

  async getHoverAuthUrl(state) {
    const response = await api.get('/api/integrations/measurements/hover/auth', { params: { state } });
    return response.data;
  },

  async createHoverCaptureRequest(data) {
    const response = await api.post('/api/integrations/measurements/hover/capture', data);
    return response.data;
  },

  async getHoverJob(jobId) {
    const response = await api.get(`/api/integrations/measurements/hover/job/${jobId}`);
    return response.data;
  },

  async getHoverJobsForCaptureRequest(captureRequestId) {
    const response = await api.get(`/api/integrations/measurements/hover/capture/${captureRequestId}/jobs`);
    return response.data;
  },

  async getHoverDeliverables(jobId, type) {
    const params = type ? { type } : {};
    const response = await api.get(`/api/integrations/measurements/hover/job/${jobId}/deliverables`, { params });
    return response.data;
  },

  async downloadHoverDeliverable(deliverableId) {
    const response = await api.get(`/api/integrations/measurements/hover/deliverable/${deliverableId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async getHover3DModelUrl(jobId) {
    const response = await api.get(`/api/integrations/measurements/hover/job/${jobId}/3d-model`);
    return response.data;
  },

  async getHoverDesignOptions(jobId) {
    const response = await api.get(`/api/integrations/measurements/hover/job/${jobId}/design-options`);
    return response.data;
  },

  async applyHoverDesign(jobId, designData) {
    const response = await api.post(`/api/integrations/measurements/hover/job/${jobId}/design`, designData);
    return response.data;
  },

  // Get measurement reports for an opportunity
  async getOpportunityReports(opportunityId) {
    const response = await api.get(`/api/integrations/measurements/opportunity/${opportunityId}`);
    return response.data;
  },
};

// CompanyCam API
export const companyCamApi = {
  // Get all projects
  async getProjects(params = {}) {
    const response = await api.get('/api/integrations/companycam/projects', { params });
    return response.data.data;
  },

  // Get single project
  async getProject(id) {
    const response = await api.get(`/api/integrations/companycam/projects/${id}`);
    return response.data.data;
  },

  // Create project in CompanyCam
  async createProject(data) {
    const response = await api.post('/api/integrations/companycam/projects', data);
    return response.data.data;
  },

  // Get photos for a project
  async getProjectPhotos(projectId, params = {}) {
    const response = await api.get(`/api/integrations/companycam/projects/${projectId}/photos`, { params });
    return response.data.data;
  },

  // Sync photos from CompanyCam to local database
  async syncProject(projectId) {
    const response = await api.post(`/api/integrations/companycam/projects/${projectId}/sync`);
    return response.data.data;
  },

  // Link CompanyCam project to Opportunity
  async linkProject(projectId, opportunityId) {
    const response = await api.post(`/api/integrations/companycam/projects/${projectId}/link`, {
      opportunityId,
    });
    return response.data.data;
  },

  // Get locally synced projects
  async getLocalProjects(params = {}) {
    const response = await api.get('/api/integrations/companycam/local', { params });
    return response.data.data;
  },

  // Get photos for an opportunity (via linked project)
  async getOpportunityPhotos(opportunityId, params = {}) {
    const response = await api.get(`/api/integrations/companycam/opportunity/${opportunityId}/photos`, { params });
    return response.data.data;
  },

  // Get recent activity
  async getActivity(limit = 20) {
    const response = await api.get('/api/integrations/companycam/activity', { params: { limit } });
    return response.data.data;
  },
};

// ============================================================================
// BAMBOOGLI - UNIFIED MESSAGING API (SMS + EMAIL)
// ============================================================================

export const bamboogliApi = {
  // ============================================================================
  // CONVERSATIONS
  // ============================================================================

  // List conversations with filtering
  async getConversations(params = {}) {
    const response = await api.get('/api/conversations', { params });
    return response.data;
  },

  // Get single conversation with messages
  async getConversation(id, params = {}) {
    const response = await api.get(`/api/conversations/${id}`, { params });
    return response.data;
  },

  // Get or create conversation by phone/email
  async getConversationByIdentifier(identifier) {
    const response = await api.get(`/api/conversations/identifier/${encodeURIComponent(identifier)}`);
    return response.data;
  },

  // Get conversations by contact
  async getConversationsByContact(contactId) {
    const response = await api.get(`/api/conversations/contact/${contactId}`);
    return response.data;
  },

  // Get conversations by opportunity
  async getConversationsByOpportunity(opportunityId) {
    const response = await api.get(`/api/conversations/opportunity/${opportunityId}`);
    return response.data;
  },

  // Update conversation
  async updateConversation(id, data) {
    const response = await api.put(`/api/conversations/${id}`, data);
    return response.data;
  },

  // Assign conversation to user
  async assignConversation(id, userId) {
    const response = await api.post(`/api/conversations/${id}/assign`, { userId });
    return response.data;
  },

  // Close conversation
  async closeConversation(id) {
    const response = await api.post(`/api/conversations/${id}/close`);
    return response.data;
  },

  // Archive conversation
  async archiveConversation(id) {
    const response = await api.post(`/api/conversations/${id}/archive`);
    return response.data;
  },

  // Mark conversation as read
  async markConversationAsRead(id) {
    const response = await api.post(`/api/conversations/${id}/read`);
    return response.data;
  },

  // Get attention queue
  async getAttentionQueue(params = {}) {
    const response = await api.get('/api/conversations/attention-queue', { params });
    return response.data;
  },

  // Get conversation stats
  async getConversationStats(params = {}) {
    const response = await api.get('/api/conversations/stats', { params });
    return response.data;
  },

  // ============================================================================
  // MESSAGES
  // ============================================================================

  // List messages
  async getMessages(params = {}) {
    const response = await api.get('/api/messages', { params });
    return response.data;
  },

  // Get single message
  async getMessage(id) {
    const response = await api.get(`/api/messages/${id}`);
    return response.data;
  },

  // Get messages by conversation
  async getMessagesByConversation(conversationId, params = {}) {
    const response = await api.get(`/api/messages/conversation/${conversationId}`, { params });
    return response.data;
  },

  // Get email thread
  async getMessageThread(threadId) {
    const response = await api.get(`/api/messages/thread/${threadId}`);
    return response.data;
  },

  // Send message (unified - auto-detects SMS or email)
  async sendMessage(data) {
    const response = await api.post('/api/messages/send', data);
    return response.data;
  },

  // Send SMS specifically
  async sendSms(data) {
    const response = await api.post('/api/messages/send/sms', data);
    return response.data;
  },

  // Send email specifically
  async sendEmail(data) {
    const response = await api.post('/api/messages/send/email', data);
    return response.data;
  },

  // Reply to a message
  async replyToMessage(id, data) {
    const response = await api.post(`/api/messages/${id}/reply`, data);
    return response.data;
  },

  // Retry failed message
  async retryMessage(id) {
    const response = await api.post(`/api/messages/${id}/retry`);
    return response.data;
  },

  // Delete message
  async deleteMessage(id) {
    const response = await api.delete(`/api/messages/${id}`);
    return response.data;
  },

  // ============================================================================
  // MESSAGE TEMPLATES
  // ============================================================================

  // List templates
  async getMessageTemplates(params = {}) {
    const response = await api.get('/api/message-templates', { params });
    return response.data;
  },

  // Get single template
  async getMessageTemplate(id) {
    const response = await api.get(`/api/message-templates/${id}`);
    return response.data;
  },

  // Create template
  async createMessageTemplate(data) {
    const response = await api.post('/api/message-templates', data);
    return response.data;
  },

  // Update template
  async updateMessageTemplate(id, data) {
    const response = await api.put(`/api/message-templates/${id}`, data);
    return response.data;
  },

  // Delete template
  async deleteMessageTemplate(id) {
    const response = await api.delete(`/api/message-templates/${id}`);
    return response.data;
  },

  // Preview template with data
  async previewMessageTemplate(id, data) {
    const response = await api.post(`/api/message-templates/${id}/preview`, { data });
    return response.data;
  },

  // ============================================================================
  // QUICK ACTIONS (for Opportunity Hub integration)
  // ============================================================================

  // Send quick SMS to contact
  async sendQuickSms(contactId, body, opportunityId = null) {
    const response = await api.post('/api/messages/send/sms', {
      contactId,
      body,
      opportunityId,
    });
    return response.data;
  },

  // Send quick email to contact
  async sendQuickEmail(contactId, subject, body, bodyHtml = null, opportunityId = null) {
    const response = await api.post('/api/messages/send/email', {
      contactId,
      subject,
      body,
      bodyHtml,
      opportunityId,
    });
    return response.data;
  },

  // Get unread count for user
  async getUnreadCount(userId) {
    const response = await api.get('/api/conversations/stats', {
      params: { assignedUserId: userId },
    });
    return response.data?.totalUnread || 0;
  },
};

// ============================================================================
// ATTENTION QUEUE API
// ============================================================================
export const attentionApi = {
  // Get attention items with filters
  async getItems(params = {}) {
    const response = await api.get('/api/attention', { params });
    return response.data;
  },

  // Get attention queue stats
  async getStats(params = {}) {
    const response = await api.get('/api/attention/stats', { params });
    return response.data;
  },

  // Get single item
  async getItem(id) {
    const response = await api.get(`/api/attention/${id}`);
    return response.data;
  },

  // Create attention item
  async createItem(data) {
    const response = await api.post('/api/attention', data);
    return response.data;
  },

  // Update attention item
  async updateItem(id, data) {
    const response = await api.put(`/api/attention/${id}`, data);
    return response.data;
  },

  // Delete attention item
  async deleteItem(id) {
    const response = await api.delete(`/api/attention/${id}`);
    return response.data;
  },

  // Complete an item
  async completeItem(id) {
    const response = await api.post(`/api/attention/${id}/complete`);
    return response.data;
  },

  // Dismiss an item
  async dismissItem(id, reason = null) {
    const response = await api.post(`/api/attention/${id}/dismiss`, { reason });
    return response.data;
  },

  // Snooze an item
  async snoozeItem(id, duration = '1d') {
    const response = await api.post(`/api/attention/${id}/snooze`, { duration });
    return response.data;
  },

  // Assign an item
  async assignItem(id, userId) {
    const response = await api.post(`/api/attention/${id}/assign`, { userId });
    return response.data;
  },

  // Start working on an item
  async startItem(id) {
    const response = await api.post(`/api/attention/${id}/start`);
    return response.data;
  },

  // Bulk complete
  async bulkComplete(ids) {
    const response = await api.post('/api/attention/bulk/complete', { ids });
    return response.data;
  },

  // Bulk dismiss
  async bulkDismiss(ids, reason = null) {
    const response = await api.post('/api/attention/bulk/dismiss', { ids, reason });
    return response.data;
  },

  // Bulk snooze
  async bulkSnooze(ids, duration = '1d') {
    const response = await api.post('/api/attention/bulk/snooze', { ids, duration });
    return response.data;
  },

  // Refresh queue (run generators)
  async refreshQueue() {
    const response = await api.post('/api/attention/refresh');
    return response.data;
  },

  // Cleanup old items
  async cleanupOldItems(olderThanDays = 30) {
    const response = await api.post('/api/attention/cleanup', { olderThanDays });
    return response.data;
  },
};

// ==========================================
// DOCUMENTS & PDF API
// ==========================================
export const documentsApi = {
  // Generate Invoice PDF
  async generateInvoicePdf(invoiceId) {
    const response = await api.post(`/api/documents/pdf/invoice/${invoiceId}`);
    return response.data;
  },

  // Generate Statement PDF for an account
  async generateStatementPdf(accountId, options = {}) {
    const response = await api.post(`/api/documents/pdf/statement/${accountId}`, options);
    return response.data;
  },

  // Generate Work Order PDF
  async generateWorkOrderPdf(workOrderId) {
    const response = await api.post(`/api/documents/pdf/workorder/${workOrderId}`);
    return response.data;
  },

  // Generate Quote PDF
  async generateQuotePdf(quoteId) {
    const response = await api.post(`/api/documents/pdf/quote/${quoteId}`);
    return response.data;
  },

  // Batch generate PDFs
  async batchGeneratePdfs(type, ids) {
    const response = await api.post('/api/documents/pdf/batch', { type, ids });
    return response.data;
  },

  // Upload document
  async uploadDocument(file, metadata = {}) {
    const formData = new FormData();
    formData.append('file', file);
    Object.keys(metadata).forEach(key => {
      formData.append(key, metadata[key]);
    });
    const response = await api.post('/api/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // ============================================================================
  // PANDASIGN - SIGNABLE DOCUMENT INTEGRATION
  // ============================================================================

  // Create signable invoice - generates PDF and creates e-signature agreement
  async createSignableInvoice(invoiceId, options = {}) {
    const response = await api.post(`/api/documents/agreements/signable/invoice/${invoiceId}`, options);
    return response.data;
  },

  // Create signable quote - generates PDF and creates e-signature agreement
  async createSignableQuote(quoteId, options = {}) {
    const response = await api.post(`/api/documents/agreements/signable/quote/${quoteId}`, options);
    return response.data;
  },

  // Create signable work order - generates PDF and creates e-signature agreement
  async createSignableWorkOrder(workOrderId, options = {}) {
    const response = await api.post(`/api/documents/agreements/signable/workorder/${workOrderId}`, options);
    return response.data;
  },

  // Create signable document from any existing PDF URL
  async createSignableFromPdf(options) {
    const response = await api.post('/api/documents/agreements/signable/pdf', options);
    return response.data;
  },

  // One-step generate and send - creates PDF, agreement, and optionally sends for signature
  async generateAndSendSignable(options) {
    const response = await api.post('/api/documents/agreements/signable/generate-and-send', options);
    return response.data;
  },
};

export default api;
