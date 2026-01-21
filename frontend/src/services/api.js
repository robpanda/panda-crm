import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

// Create axios instance with interceptors
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track refresh state to prevent loops
let isRefreshing = false;
let refreshSubscribers = [];
let isRedirectingToLogin = false;

// Subscribe to refresh completion
const subscribeToRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

// Notify all subscribers when refresh completes
const onRefreshComplete = (token) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

// Redirect to login (only once)
const redirectToLogin = () => {
  // Prevent redirect loops - don't redirect if already on login page or already redirecting
  if (window.location.pathname === '/login' || isRedirectingToLogin) {
    return;
  }
  isRedirectingToLogin = true;
  localStorage.clear();
  window.location.href = '/login';
};

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    // Block requests if we're redirecting to login
    if (isRedirectingToLogin) {
      const controller = new AbortController();
      controller.abort();
      config.signal = controller.signal;
      return config;
    }

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

    // Skip refresh logic if already on login page or redirecting
    if (window.location.pathname === '/login' || isRedirectingToLogin) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // If already refreshing, wait for the refresh to complete
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeToRefresh((token) => {
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }

      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        let userEmail = localStorage.getItem('userEmail');

        // Fallback: try to extract email from idToken if not stored
        if (!userEmail) {
          const idToken = localStorage.getItem('idToken');
          if (idToken) {
            try {
              const payload = JSON.parse(atob(idToken.split('.')[1]));
              userEmail = payload.email;
              if (userEmail) {
                localStorage.setItem('userEmail', userEmail);
              }
            } catch (e) {
              // Could not parse idToken
            }
          }
        }

        if (refreshToken && userEmail) {
          const response = await axios.post(`${API_BASE}/api/auth/refresh`, {
            refreshToken,
            email: userEmail,
          });

          const { accessToken, idToken } = response.data.data;
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('idToken', idToken);

          isRefreshing = false;
          onRefreshComplete(accessToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } else {
          // No refresh token available, redirect to login
          isRefreshing = false;
          onRefreshComplete(null);
          redirectToLogin();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        isRefreshing = false;
        onRefreshComplete(null);
        redirectToLogin();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Reset redirect flag (call after successful login)
export const resetAuthState = () => {
  isRedirectingToLogin = false;
  isRefreshing = false;
  refreshSubscribers = [];
};

// Auth API
export const authApi = {
  async login(email, password) {
    // Reset auth state on login attempt
    resetAuthState();
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

  async refreshToken(refreshToken, email) {
    const response = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken, email });
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

  async bulkReassign(accountIds, newOwnerId) {
    const response = await api.post('/api/accounts/bulk-reassign', { accountIds, newOwnerId });
    return response.data;
  },

  async bulkUpdateStatus(accountIds, status) {
    const response = await api.post('/api/accounts/bulk-update-status', { accountIds, status });
    return response.data;
  },

  async bulkDelete(accountIds) {
    const response = await api.post('/api/accounts/bulk-delete', { accountIds });
    return response.data;
  },

  async getDeletedAccounts(params = {}) {
    const response = await api.get('/api/accounts/deleted', { params });
    return response.data;
  },

  async restoreAccount(id) {
    const response = await api.post(`/api/accounts/${id}/restore`);
    return response.data;
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

  async bulkReassignAccount(contactIds, newAccountId) {
    const response = await api.post('/api/contacts/bulk-reassign-account', { contactIds, newAccountId });
    return response.data;
  },

  async bulkDelete(contactIds) {
    const response = await api.post('/api/contacts/bulk-delete', { contactIds });
    return response.data;
  },

  async bulkOptOut(contactIds, field, value) {
    const response = await api.post('/api/contacts/bulk-opt-out', { contactIds, field, value });
    return response.data;
  },

  async getDeletedContacts(params = {}) {
    const response = await api.get('/api/contacts/deleted', { params });
    return response.data;
  },

  async restoreContact(id) {
    const response = await api.post(`/api/contacts/${id}/restore`);
    return response.data;
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

  async getLeadCounts(ownerIdOrParams, ownerIds) {
    const params = {};
    // Handle both calling conventions:
    // 1. getLeadCounts(ownerId, ownerIds) - string, array
    // 2. getLeadCounts({ownerId, ownerIds}) - params object
    if (typeof ownerIdOrParams === 'object' && ownerIdOrParams !== null) {
      // Called with params object
      if (ownerIdOrParams.ownerId) params.ownerId = ownerIdOrParams.ownerId;
      if (ownerIdOrParams.ownerIds) {
        params.ownerIds = Array.isArray(ownerIdOrParams.ownerIds)
          ? ownerIdOrParams.ownerIds.join(',')
          : ownerIdOrParams.ownerIds;
      }
    } else {
      // Called with (ownerId, ownerIds) arguments
      if (ownerIdOrParams) params.ownerId = ownerIdOrParams;
      if (ownerIds && ownerIds.length > 0) params.ownerIds = ownerIds.join(',');
    }
    const response = await api.get('/api/leads/counts', { params });
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

  // Call Center Dashboard APIs
  async getCallCenterLeaderboard(params = {}) {
    const response = await api.get('/api/leads/call-center/leaderboard', { params });
    return response.data.data;
  },

  async getMyCallCenterStats(params = {}) {
    const response = await api.get('/api/leads/call-center/my-stats', { params });
    return response.data.data;
  },

  async getCallCenterTeamTotals(params = {}) {
    const response = await api.get('/api/leads/call-center/team-totals', { params });
    return response.data.data;
  },

  // Unconfirmed Leads - leads with tentative appointment that need confirmation
  async getUnconfirmedLeads(params = {}) {
    const response = await api.get('/api/leads/call-center/unconfirmed', { params });
    return response.data;
  },

  // Add call center note to lead
  async addLeadNote(id, note) {
    const response = await api.post(`/api/leads/${id}/notes`, { note });
    return response.data.data;
  },

  // Bulk Reassignment APIs
  async getAssignableUsers() {
    const response = await api.get('/api/leads/assignable-users');
    return response.data.data;
  },

  async bulkReassignLeads(leadIds, newOwnerId) {
    const response = await api.post('/api/leads/bulk-reassign', { leadIds, newOwnerId });
    return response.data;
  },

  async bulkUpdateStatus(leadIds, status, disposition = null) {
    const response = await api.post('/api/leads/bulk-update-status', { leadIds, status, disposition });
    return response.data;
  },

  async bulkDeleteLeads(leadIds) {
    const response = await api.post('/api/leads/bulk-delete', { leadIds });
    return response.data;
  },

  async getDeletedLeads(params = {}) {
    const response = await api.get('/api/leads/deleted', { params });
    return response.data;
  },

  async restoreLead(id) {
    const response = await api.post(`/api/leads/${id}/restore`);
    return response.data;
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

  async updateInvoiceStatus(id, invoiceStatus, followUpDate) {
    const response = await api.put(`/api/opportunities/${id}/invoice-status`, {
      invoiceStatus,
      followUpDate,
    });
    return response.data.data;
  },

  async markInvoiceReady(id) {
    const response = await api.post(`/api/opportunities/${id}/mark-invoice-ready`);
    return response.data;
  },

  async deleteOpportunity(id) {
    const response = await api.delete(`/api/opportunities/${id}`);
    return response.data.data;
  },

  async assignJobId(id) {
    const response = await api.post(`/api/opportunities/${id}/assign-job-id`);
    return response.data;
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

  async getStageCounts(ownerFilter, ownerIds, ownerId) {
    const params = {};
    if (ownerFilter) params.ownerFilter = ownerFilter;
    if (ownerId) params.ownerId = ownerId;
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

  // Generate AI summary for activity content
  async summarizeActivity(id, content, activityId = null) {
    const response = await api.post(`/api/opportunities/${id}/activity/summarize`, { content, activityId });
    return response.data.data;
  },

  // Generate AI summary for entire conversation/communications
  async summarizeConversation(id) {
    const response = await api.post(`/api/opportunities/${id}/conversation/summarize`);
    return response.data.data;
  },

  // Add a reply/comment with @mentions
  async addReply(id, data) {
    // data: { content, parentId?, mentions?: [{ userId, name }], channel: 'email'|'sms'|'note' }
    const response = await api.post(`/api/opportunities/${id}/replies`, data);
    return response.data.data;
  },

  // Get threaded conversation
  async getThreadedConversation(id) {
    const response = await api.get(`/api/opportunities/${id}/conversation/threaded`);
    return response.data.data;
  },

  // Get documents/agreements
  async getDocuments(id) {
    const response = await api.get(`/api/opportunities/${id}/documents`);
    return response.data.data;
  },

  // ============================================================================
  // CALL CENTER ENDPOINTS
  // ============================================================================

  // Get unscheduled appointments - opportunities that need service appointment booked
  async getUnscheduledAppointments(params = {}) {
    const response = await api.get('/api/opportunities/call-center/unscheduled', { params });
    return response.data;
  },

  // Book/schedule appointment on an opportunity
  async bookAppointment(id, appointmentData) {
    const response = await api.post(`/api/opportunities/${id}/appointments/book`, appointmentData);
    return response.data.data;
  },

  // Reschedule an existing appointment
  async rescheduleAppointment(id, appointmentId, newDateTime) {
    const response = await api.put(`/api/opportunities/${id}/appointments/${appointmentId}/reschedule`, newDateTime);
    return response.data.data;
  },

  // Cancel an appointment
  async cancelAppointment(id, appointmentId, reason) {
    const response = await api.post(`/api/opportunities/${id}/appointments/${appointmentId}/cancel`, { reason });
    return response.data.data;
  },

  // Add job message/note to opportunity
  async addJobMessage(id, message) {
    const response = await api.post(`/api/opportunities/${id}/messages`, { message });
    return response.data.data;
  },

  // ============================================================================
  // SERVICE REQUEST ENDPOINTS
  // Per Creating A Service Request SOP - service requests live on jobs (opportunities)
  // ============================================================================

  // Get opportunities with active service requests
  async getServiceRequests(params = {}) {
    const response = await api.get('/api/opportunities/service-requests', { params });
    return response.data;
  },

  // Create a service request on an opportunity
  async createServiceRequest(opportunityId, data) {
    const response = await api.post(`/api/opportunities/${opportunityId}/service-request`, data);
    return response.data;
  },

  // Update a service request on an opportunity
  async updateServiceRequest(opportunityId, data) {
    const response = await api.put(`/api/opportunities/${opportunityId}/service-request`, data);
    return response.data;
  },

  // Mark a service request as complete
  async completeServiceRequest(opportunityId, notes = null) {
    const response = await api.post(`/api/opportunities/${opportunityId}/service-request/complete`, { notes });
    return response.data;
  },

  // ============================================================================
  // SPECS PREPARATION ENDPOINTS
  // ============================================================================

  // Get specs data for an opportunity
  async getSpecs(opportunityId) {
    const response = await api.get(`/api/opportunities/${opportunityId}/specs`);
    return response.data.data;
  },

  // Complete specs preparation and trigger workflow
  // Creates WorkOrderLineItem and Contract Signing appointment
  async completeSpecs(opportunityId, specsData) {
    const response = await api.post(`/api/opportunities/${opportunityId}/specs/complete`, { specsData });
    return response.data;
  },

  // ============================================================================
  // BULK REASSIGNMENT ENDPOINTS - Contact Center feature
  // ============================================================================

  // Get users who can be assigned as job owners
  async getAssignableUsers() {
    const response = await api.get('/api/opportunities/assignable-users');
    return response.data.data;
  },

  // Bulk reassign multiple jobs to a new owner
  async bulkReassignJobs(opportunityIds, newOwnerId) {
    const response = await api.post('/api/opportunities/bulk-reassign', { opportunityIds, newOwnerId });
    return response.data;
  },

  async bulkUpdateStage(opportunityIds, stage) {
    const response = await api.post('/api/opportunities/bulk-update-stage', { opportunityIds, stage });
    return response.data;
  },

  async bulkDeleteOpportunities(opportunityIds) {
    const response = await api.post('/api/opportunities/bulk-delete', { opportunityIds });
    return response.data;
  },

  // ============================================================================
  // PROJECT EXPEDITING ENDPOINTS
  // Operations workflow - project expediting after onboarding
  // ============================================================================

  // Get expediting queue (jobs ready for or in expediting)
  async getExpeditingQueue(params = {}) {
    const response = await api.get('/api/opportunities/expediting-queue', { params });
    return response.data;
  },

  // Get expediting statistics
  async getExpeditingStats() {
    const response = await api.get('/api/opportunities/expediting-stats');
    return response.data.data;
  },

  // Start project expediting for an opportunity
  async startExpediting(opportunityId, projectExpeditorId = null) {
    const response = await api.post(`/api/opportunities/${opportunityId}/start-expediting`, {
      projectExpeditorId,
    });
    return response.data.data;
  },

  // Update expediting fields on an opportunity
  async updateExpediting(opportunityId, data) {
    const response = await api.patch(`/api/opportunities/${opportunityId}/expediting`, data);
    return response.data.data;
  },

  async getDeletedOpportunities(params = {}) {
    const response = await api.get('/api/opportunities/deleted', { params });
    return response.data;
  },

  async restoreOpportunity(id) {
    const response = await api.post(`/api/opportunities/${id}/restore`);
    return response.data;
  },

  // ============================================================================
  // NOTES ENDPOINTS
  // Notes with pinning support - one pinned note at top, others chronological
  // ============================================================================

  // Get all notes for an opportunity (pinned first, then chronological)
  async getNotes(opportunityId) {
    const response = await api.get(`/api/opportunities/${opportunityId}/notes`);
    return response.data.data;
  },

  // Create a new note for an opportunity
  async createNote(opportunityId, data) {
    // data: { title?, body, isPinned? }
    const response = await api.post(`/api/opportunities/${opportunityId}/notes`, data);
    return response.data.data;
  },

  // Update a note
  async updateNote(opportunityId, noteId, data) {
    // data: { title?, body?, isPinned? }
    const response = await api.put(`/api/opportunities/${opportunityId}/notes/${noteId}`, data);
    return response.data.data;
  },

  // Delete a note
  async deleteNote(opportunityId, noteId) {
    const response = await api.delete(`/api/opportunities/${opportunityId}/notes/${noteId}`);
    return response.data.data;
  },

  // Toggle pin status on a note (only one pinned at a time)
  async toggleNotePin(opportunityId, noteId) {
    const response = await api.post(`/api/opportunities/${opportunityId}/notes/${noteId}/pin`);
    return response.data.data;
  },

  // ============================================================================
  // JOB APPROVAL ENDPOINTS - PandaClaims Unapproved Jobs Workflow
  // ============================================================================

  // Get list of unapproved jobs for the dashboard
  async getUnapprovedJobs(params = {}) {
    const response = await api.get('/api/opportunities/unapproved', { params });
    return response.data;
  },

  // Get statistics for unapproved jobs dashboard
  async getUnapprovedJobsStats(ownerFilter = 'all') {
    const response = await api.get('/api/opportunities/unapproved/stats', { params: { ownerFilter } });
    return response.data.data;
  },

  // Submit a job for approval
  async requestJobApproval(opportunityId, data = {}) {
    // data: { reason?: string, priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }
    const response = await api.post(`/api/opportunities/${opportunityId}/request-approval`, data);
    return response.data.data;
  },

  // Approve a job
  async approveJob(opportunityId, reason = null) {
    const response = await api.post(`/api/opportunities/${opportunityId}/approve`, { reason });
    return response.data.data;
  },

  // Reject a job approval
  async rejectJobApproval(opportunityId, reason) {
    const response = await api.post(`/api/opportunities/${opportunityId}/reject-approval`, { reason });
    return response.data.data;
  },

  // Get approval history for a job
  async getJobApprovalHistory(opportunityId) {
    const response = await api.get(`/api/opportunities/${opportunityId}/approval-history`);
    return response.data.data;
  },

  // Get cases related to a job for approval context
  async getRelatedCases(opportunityId) {
    const response = await api.get(`/api/opportunities/${opportunityId}/related-cases`);
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

  async sendInvoice(id, data = {}) {
    const response = await api.post(`/api/invoices/${id}/send`, data);
    return response.data;
  },

  async getInvoicePdf(id) {
    const response = await api.get(`/api/invoices/${id}/pdf`);
    return response.data;
  },

  async generateInvoicePdf(id) {
    const response = await api.post(`/api/invoices/${id}/pdf`);
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

  async searchUsers(queryOrParams) {
    // Support both string query and object { query, limit }
    const params = typeof queryOrParams === 'string'
      ? { q: queryOrParams }
      : { q: queryOrParams.query, limit: queryOrParams.limit };
    const response = await api.get('/api/users/search', { params });
    return response.data.data;
  },

  async getUsersForDropdown(params = {}) {
    const response = await api.get('/api/users/dropdown', { params });
    return response.data;
  },

  // Alias for backwards compatibility
  async getDropdownUsers(params = {}) {
    const response = await api.get('/api/users/dropdown', { params });
    return response.data;
  },

  async getUserStats() {
    const response = await api.get('/api/users/stats');
    return response.data.data;
  },

  async getDirectReports(id) {
    const response = await api.get(`/api/users/${id}/direct-reports`);
    return response.data.data;
  },

  async createUser(data) {
    const response = await api.post('/api/auth/admin/users', data);
    return response.data.data;
  },

  async deleteUser(id) {
    const response = await api.delete(`/api/users/${id}`);
    return response.data.data;
  },

  async resetUserPassword(email, newPassword) {
    const response = await api.post(`/api/auth/admin/users/${encodeURIComponent(email)}/password`, { newPassword });
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

  async getAccessiblePages() {
    const response = await api.get('/api/permissions/pages');
    return response.data.data;
  },

  async getAllPages() {
    const response = await api.get('/api/permissions/pages/all');
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

  async bulkApprove(commissionIds, notes) {
    const response = await api.post('/api/commissions/bulk-approve', { commissionIds, notes });
    return response.data.data;
  },

  async bulkPay(commissionIds, notes) {
    const response = await api.post('/api/commissions/bulk-pay', { commissionIds, notes });
    return response.data.data;
  },

  // Revert a manual override back to original calculated amount
  async revertOverride(id) {
    const response = await api.post(`/api/commissions/${id}/revert-override`);
    return response.data.data;
  },

  async deleteCommission(id) {
    const response = await api.delete(`/api/commissions/${id}`);
    return response.data.data;
  },

  // Update paid amount (for payroll adjustments)
  // Per Scribehow: Edit Commission Record's "Paid Amount" field
  async updatePaidAmount(id, paidAmount, notes) {
    const response = await api.patch(`/api/commissions/${id}/paid-amount`, { paidAmount, notes });
    return response.data.data;
  },

  // Get Payroll Change Report data
  async getPayrollChanges(params = {}) {
    const response = await api.get('/api/commissions/payroll-changes', { params });
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

  // Commission Profiles (User commission rates)
  async getCommissionProfiles(params = {}) {
    const response = await api.get('/api/users', {
      params: {
        ...params,
        hasCommissionRates: true,
        fields: 'id,firstName,lastName,fullName,email,title,department,officeAssignment,companyLeadRate,selfGenRate,preCommissionRate,commissionRate,overridePercent,supplementsCommissionable,x5050CommissionSplit,isActive'
      }
    });
    return response.data;
  },

  async updateCommissionProfile(userId, data) {
    const response = await api.put(`/api/users/${userId}`, data);
    return response.data.data;
  },

  async bulkUpdateCommissionProfiles(updates) {
    // updates is an array of { userId, ...commissionFields }
    const response = await api.post('/api/users/bulk-update-commission-profiles', { updates });
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

  // ====== FSL-EQUIVALENT SCHEDULING APIs ======

  // Geocoding
  async geocodeAddress(address) {
    const response = await api.post('/api/scheduling/geocode', { address });
    return response.data;
  },

  async geocodeAccount(accountId) {
    const response = await api.post(`/api/scheduling/geocode/account/${accountId}`);
    return response.data;
  },

  async geocodeAppointment(appointmentId) {
    const response = await api.post(`/api/scheduling/geocode/appointment/${appointmentId}`);
    return response.data;
  },

  async batchGeocodeAppointments(appointmentIds) {
    const response = await api.post('/api/scheduling/geocode/appointments/batch', { appointmentIds });
    return response.data;
  },

  // Distance & Route Calculation
  async calculateDistance(fromLat, fromLng, toLat, toLng) {
    const response = await api.post('/api/scheduling/distance', { fromLat, fromLng, toLat, toLng });
    return response.data;
  },

  async findNearbyAppointments(lat, lng, radiusMiles = 10, date = null) {
    const response = await api.post('/api/scheduling/appointments/nearby', { lat, lng, radiusMiles, date });
    return response.data;
  },

  async suggestTimeSlots(appointmentId, params = {}) {
    const response = await api.post('/api/scheduling/appointments/suggest-slots', { appointmentId, ...params });
    return response.data;
  },

  // Resource Matching
  async checkSkillMatch(resourceId, workTypeId) {
    const response = await api.get(`/api/scheduling/resources/${resourceId}/skill-match/${workTypeId}`);
    return response.data;
  },

  async checkTerritoryMatch(resourceId, territoryId) {
    const response = await api.get(`/api/scheduling/resources/${resourceId}/territory-match/${territoryId}`);
    return response.data;
  },

  async getResourceUtilization(resourceId, params = {}) {
    const response = await api.get(`/api/scheduling/resources/${resourceId}/utilization`, { params });
    return response.data;
  },

  async findBestResources(appointmentId, params = {}) {
    const response = await api.get(`/api/scheduling/appointments/${appointmentId}/best-resources`, { params });
    return response.data;
  },

  // Smart Scheduling (Policy-Based)
  async smartAutoSchedule(appointmentId, policyId = null) {
    const response = await api.post(`/api/scheduling/appointments/${appointmentId}/smart-schedule`, { policyId });
    return response.data;
  },

  async batchSmartSchedule(appointmentIds, policyId = null) {
    const response = await api.post('/api/scheduling/appointments/batch-schedule', { appointmentIds, policyId });
    return response.data;
  },

  // Capacity Planning
  async getResourceCapacity(resourceId, params = {}) {
    const response = await api.get(`/api/scheduling/capacity/${resourceId}`, { params });
    return response.data;
  },

  async updateResourceCapacity(resourceId, data) {
    const response = await api.post(`/api/scheduling/capacity/${resourceId}`, data);
    return response.data;
  },

  async getTeamCapacity(territoryId, params = {}) {
    const response = await api.get(`/api/scheduling/capacity/team/${territoryId}`, { params });
    return response.data;
  },

  // Route Optimization
  async optimizeResourceRoute(resourceId, date) {
    const response = await api.post('/api/scheduling/optimize', { resourceId, date });
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

  // Skills
  async getSkills(params = {}) {
    const response = await api.get('/api/resources/skills', { params });
    return response.data;
  },

  // Scheduling Policies
  async getSchedulingPolicies(params = {}) {
    const response = await api.get('/api/resources/scheduling-policies', { params });
    return response.data;
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

  // Google Calendar Events for Schedule Integration
  async getResourceCalendarEvents(params = {}) {
    // Fetch Google Calendar events for all service resources
    const response = await api.get('/api/integrations/google/resource-events', { params });
    return response.data;
  },

  async getResourceCalendarEventsById(resourceId, params = {}) {
    // Fetch Google Calendar events for a specific service resource
    const response = await api.get(`/api/integrations/google/resource/${resourceId}/events`, { params });
    return response.data;
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

  // ====== SCHEDULING POLICIES (FSL-like) ======
  async getSchedulingPolicies() {
    const response = await api.get('/api/scheduling-policies');
    return response.data;
  },

  async getDefaultSchedulingPolicy() {
    const response = await api.get('/api/scheduling-policies/default');
    return response.data;
  },

  async getSchedulingPolicy(id) {
    const response = await api.get(`/api/scheduling-policies/${id}`);
    return response.data;
  },

  async createSchedulingPolicy(data) {
    const response = await api.post('/api/scheduling-policies', data);
    return response.data;
  },

  async updateSchedulingPolicy(id, data) {
    const response = await api.put(`/api/scheduling-policies/${id}`, data);
    return response.data;
  },

  async deleteSchedulingPolicy(id) {
    const response = await api.delete(`/api/scheduling-policies/${id}`);
    return response.data;
  },

  async findAvailableSlots(params) {
    const response = await api.post('/api/scheduling-policies/find-slots', params);
    return response.data;
  },

  async autoScheduleAppointment(params) {
    const response = await api.post('/api/scheduling-policies/auto-schedule', params);
    return response.data;
  },

  async checkResourceAvailability(params) {
    const response = await api.post('/api/scheduling-policies/check-availability', params);
    return response.data;
  },

  async calculateDueDate(earliestStart, mode = 'default') {
    const response = await api.post('/api/scheduling-policies/calculate-due-date', { earliestStart, mode });
    return response.data;
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
  async getStripeConfig() {
    const response = await api.get('/api/payments/config');
    return response.data.data;
  },

  async createPaymentIntent(data) {
    const response = await api.post('/api/payments/intent', data);
    return response.data.data;
  },

  async createPaymentIntentForInvoice(invoiceId, amount) {
    const response = await api.post(`/api/payments/invoices/${invoiceId}/create-intent`, { amount });
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

  // === STRIPE SYNC ===
  async syncStripePayments({ daysBack = 30, limit = 100 } = {}) {
    const response = await api.post('/api/payments/sync-stripe', { daysBack, limit });
    return response.data.data;
  },

  async getStripeCharges({ daysBack = 30, limit = 100 } = {}) {
    const response = await api.get('/api/payments/stripe-charges', { params: { daysBack, limit } });
    return response.data.data;
  },

  // === QUICKBOOKS SYNC ===
  async syncQuickBooksInvoices({ daysBack = 30, limit = 500 } = {}) {
    const response = await api.post('/api/payments/sync-quickbooks-invoices', { daysBack, limit });
    return response.data.data;
  },

  async getQuickBooksInvoices({ daysBack = 30, limit = 50 } = {}) {
    const response = await api.get('/api/payments/quickbooks-invoices', { params: { daysBack, limit } });
    return response.data.data;
  },

  // === SUBSCRIPTIONS (Payment Plans) ===
  async getSubscriptions(params = {}) {
    const response = await api.get('/api/subscriptions', { params });
    return response.data.data;
  },

  async getSubscription(subscriptionId) {
    const response = await api.get(`/api/subscriptions/${subscriptionId}`);
    return response.data.data;
  },

  async createSubscription(data) {
    // data: { accountId, planName, amount, interval, intervalCount?, trialPeriodDays?, metadata? }
    const response = await api.post('/api/subscriptions', data);
    return response.data.data;
  },

  async updateSubscription(subscriptionId, data) {
    const response = await api.put(`/api/subscriptions/${subscriptionId}`, data);
    return response.data.data;
  },

  async cancelSubscription(subscriptionId, immediately = false) {
    const response = await api.post(`/api/subscriptions/${subscriptionId}/cancel`, { immediately });
    return response.data.data;
  },

  async pauseSubscription(subscriptionId) {
    const response = await api.post(`/api/subscriptions/${subscriptionId}/pause`);
    return response.data.data;
  },

  async resumeSubscription(subscriptionId) {
    const response = await api.post(`/api/subscriptions/${subscriptionId}/resume`);
    return response.data.data;
  },

  async getUpcomingInvoice(subscriptionId) {
    const response = await api.get(`/api/subscriptions/${subscriptionId}/upcoming-invoice`);
    return response.data.data;
  },

  // === PRODUCTS & PRICES (for subscriptions) ===
  async getProducts(params = {}) {
    const response = await api.get('/api/subscriptions/products', { params });
    return response.data.data;
  },

  async createProduct(data) {
    const response = await api.post('/api/subscriptions/products', data);
    return response.data.data;
  },

  async getPrices(params = {}) {
    const response = await api.get('/api/subscriptions/prices', { params });
    return response.data.data;
  },

  async createPrice(data) {
    const response = await api.post('/api/subscriptions/prices', data);
    return response.data.data;
  },

  // === QUICKBOOKS ===
  async getQuickBooksStatus() {
    const response = await api.get('/api/quickbooks/status');
    return response.data.data;
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

  async deleteSchedulingPolicy(id) {
    const response = await api.delete(`/api/field-service/scheduling-policies/${id}`);
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

  /**
   * Get appointments in SCHEDULED status that are ready to be dispatched
   * This is the "Confirmations Pending" queue from FSL workflow
   */
  async getConfirmationsQueue() {
    const response = await api.get('/api/service-appointments', {
      params: {
        status: 'SCHEDULED',
        limit: 100,
        sortBy: 'scheduledStart',
        sortOrder: 'asc',
      },
    });
    return response.data?.data || [];
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

  // === User-level Calendar Sync Methods ===

  // Get connection status for current user
  async getUserConnectionStatus(userId) {
    const response = await api.get(`/api/integrations/google/users/${userId}/status`);
    return response.data.data;
  },

  // Link user to their Google Calendar email
  async linkUserCalendar(userId, googleCalendarEmail, enableSync = true) {
    const response = await api.post(`/api/integrations/google/users/${userId}/link`, {
      googleCalendarEmail,
      enableSync,
    });
    return response.data.data;
  },

  // Sync appointments for user
  async syncUserCalendar(userId) {
    const response = await api.post(`/api/integrations/google/sync/${userId}`);
    return response.data.data;
  },

  // Get user's calendar events
  async getUserEvents(userId, startDate, endDate) {
    const response = await api.get(`/api/integrations/google/events/${userId}`, {
      params: { startDate, endDate },
    });
    return response.data.data;
  },

  // Test calendar connection
  async testConnection(email) {
    const response = await api.get('/api/integrations/google/test', {
      params: { email },
    });
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

  // Get measurement reports for an opportunity (all reports including pending)
  async getOpportunityReports(opportunityId) {
    const response = await api.get(`/api/integrations/measurements/opportunity/${opportunityId}?all=true`);
    return response.data;
  },

  // Free Roof Measurement using NAIP imagery pipeline
  // Generates PDF report with measurements from free aerial imagery
  async getInstantMeasurement(data) {
    const response = await api.post('/api/integrations/measurements/naip/generate', data);
    return response.data;
  },

  // Check ML measurement system status
  async checkMLStatus() {
    const response = await api.get('/api/integrations/measurements/ml/status');
    return response.data;
  },

  // Check Geospan coverage for a location
  async checkGSquareCoverage(lat, lng) {
    const response = await api.get(`/api/integrations/measurements/ml/coverage?lat=${lat}&lng=${lng}`);
    return response.data;
  },

  async geocodeAddress(address) {
    const response = await api.post('/api/integrations/measurements/instant/geocode', { address });
    return response.data;
  },

  async checkGoogleSolarStatus() {
    const response = await api.get('/api/integrations/measurements/google-solar/status');
    return response.data;
  },

  async getGoogleSolarBuildingInsights(lat, lng, quality = 'HIGH') {
    const response = await api.post('/api/integrations/measurements/google-solar/building-insights', { lat, lng, quality });
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

  // Search projects by query
  async searchProjects(params = {}) {
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

  // ============================================================================
  // CREW ACCESS MANAGEMENT
  // ============================================================================

  // Get all CompanyCam users
  async getUsers() {
    const response = await api.get('/api/integrations/companycam/users');
    return response.data.data;
  },

  // Search for a user by email
  async searchUserByEmail(email) {
    const response = await api.get('/api/integrations/companycam/users/search', { params: { email } });
    return response.data.data;
  },

  // Create a new CompanyCam user
  async createUser(userData) {
    const response = await api.post('/api/integrations/companycam/users', userData);
    return response.data.data;
  },

  // Get collaborators for a project
  async getProjectCollaborators(projectId) {
    const response = await api.get(`/api/integrations/companycam/projects/${projectId}/collaborators`);
    return response.data.data;
  },

  // Ensure crew has access to a project (creates user if needed, adds as collaborator)
  async ensureCrewAccess({ email, firstName, lastName, phone, companyCamProjectId, opportunityId }) {
    const response = await api.post('/api/integrations/companycam/crew/ensure-access', {
      email,
      firstName,
      lastName,
      phone,
      companyCamProjectId,
      opportunityId,
    });
    return response.data.data;
  },

  // Revoke crew access from a project
  async revokeCrewAccess({ email, companyCamProjectId }) {
    const response = await api.post('/api/integrations/companycam/crew/revoke-access', {
      email,
      companyCamProjectId,
    });
    return response.data.data;
  },

  // ============================================================================
  // PHOTO TAG MANAGEMENT (Local Database)
  // ============================================================================

  // Add a tag to a photo
  async addPhotoTag(photoId, tag) {
    const response = await api.post(`/api/integrations/companycam/photos/${photoId}/tags`, { tag });
    return response.data.data;
  },

  // Remove a tag from a photo
  async removePhotoTag(photoId, tag) {
    const response = await api.delete(`/api/integrations/companycam/photos/${photoId}/tags/${encodeURIComponent(tag)}`);
    return response.data.data;
  },

  // Set/replace all tags on a photo
  async setPhotoTags(photoId, tags) {
    const response = await api.put(`/api/integrations/companycam/photos/${photoId}/tags`, { tags });
    return response.data.data;
  },

  // Get all tags with usage counts
  async getAllTags() {
    const response = await api.get('/api/integrations/companycam/tags');
    return response.data.data;
  },

  // Get all unique tags in a project
  async getProjectTags(projectId) {
    const response = await api.get(`/api/integrations/companycam/projects/${projectId}/tags`);
    return response.data.data;
  },

  // Bulk add or remove tags from multiple photos
  async bulkTagPhotos(photoIds, tag, action) {
    const response = await api.post('/api/integrations/companycam/photos/bulk-tags', {
      photoIds,
      tag,
      action, // 'add' or 'remove'
    });
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

  // ============================================================================
  // SETTINGS
  // ============================================================================

  // Get all settings
  async getSettings() {
    const response = await api.get('/api/bamboogli/settings');
    return response.data;
  },

  // Update settings
  async updateSettings(data) {
    const response = await api.put('/api/bamboogli/settings', data);
    return response.data;
  },

  // Get channel connection status (Twilio/SendGrid)
  async getChannelStatus() {
    const response = await api.get('/api/bamboogli/settings/channel-status');
    return response.data;
  },

  // Get message stats (real data from database)
  async getMessageStats(params = {}) {
    const response = await api.get('/api/bamboogli/settings/stats', { params });
    return response.data;
  },

  // Test SMS connection
  async testSmsConnection(phoneNumber) {
    const response = await api.post('/api/bamboogli/settings/test-sms', { phoneNumber });
    return response.data;
  },

  // Test email connection
  async testEmailConnection(email) {
    const response = await api.post('/api/bamboogli/settings/test-email', { email });
    return response.data;
  },

  // ============================================================================
  // PHONE NUMBERS
  // ============================================================================

  // Get all connected phone numbers
  async getPhoneNumbers() {
    const response = await api.get('/api/bamboogli/settings/phone-numbers');
    return response.data;
  },

  // Get single phone number by ID
  async getPhoneNumber(id) {
    const response = await api.get(`/api/bamboogli/settings/phone-numbers/${id}`);
    return response.data;
  },

  // Add a new phone number
  async addPhoneNumber(data) {
    const response = await api.post('/api/bamboogli/settings/phone-numbers', data);
    return response.data;
  },

  // Update phone number settings
  async updatePhoneNumber(id, data) {
    const response = await api.put(`/api/bamboogli/settings/phone-numbers/${id}`, data);
    return response.data;
  },

  // Delete a phone number
  async deletePhoneNumber(id) {
    const response = await api.delete(`/api/bamboogli/settings/phone-numbers/${id}`);
    return response.data;
  },

  // ============================================================================
  // AUTOMATIONS
  // ============================================================================

  // Get all automation configurations
  async getAutomations() {
    const response = await api.get('/api/automations');
    return response.data;
  },

  // Get single automation configuration
  async getAutomation(type) {
    const response = await api.get(`/api/automations/${type}`);
    return response.data;
  },

  // Update automation configuration
  async updateAutomation(type, data) {
    const response = await api.put(`/api/automations/${type}`, data);
    return response.data;
  },

  // Test automation (send test message)
  async testAutomation(type, { channel, to }) {
    const response = await api.post(`/api/automations/${type}/test`, { channel, to });
    return response.data;
  },

  // Trigger automation for an appointment
  async triggerAutomation(automationType, { appointmentId, opportunityId, resourceId }) {
    const response = await api.post('/api/automations/trigger', {
      automationType,
      appointmentId,
      opportunityId,
      resourceId,
    });
    return response.data;
  },

  // Get automation execution history
  async getAutomationHistory(params = {}) {
    const response = await api.get('/api/automations/history', { params });
    return response.data;
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
// RINGCENTRAL PHONE SYSTEM API
// ==========================================
export const ringCentralApi = {
  // ============================================================================
  // CONNECTION & STATUS
  // ============================================================================

  async getStatus() {
    const response = await api.get('/api/integrations/ringcentral/status');
    return response.data;
  },

  async getAuthUrl(state = null) {
    const response = await api.get('/api/integrations/ringcentral/auth', {
      params: state ? { state } : {},
    });
    return response.data;
  },

  async disconnect() {
    const response = await api.post('/api/integrations/ringcentral/disconnect');
    return response.data;
  },

  // ============================================================================
  // CALL LOGS
  // ============================================================================

  async getCallLogs(params = {}) {
    const response = await api.get('/api/integrations/ringcentral/calls', { params });
    return response.data;
  },

  async getCallLog(id) {
    const response = await api.get(`/api/integrations/ringcentral/calls/${id}`);
    return response.data;
  },

  async syncCalls(options = {}) {
    const response = await api.post('/api/integrations/ringcentral/sync', options);
    return response.data;
  },

  async getCallStats(params = {}) {
    const response = await api.get('/api/integrations/ringcentral/stats', { params });
    return response.data;
  },

  async getAgentStats(agentId, params = {}) {
    const response = await api.get(`/api/integrations/ringcentral/stats/agent/${agentId}`, { params });
    return response.data;
  },

  // ============================================================================
  // CLICK-TO-CALL (RingOut)
  // ============================================================================

  async initiateCall(data) {
    const response = await api.post('/api/integrations/ringcentral/call', data);
    return response.data;
  },

  async getRingOutStatus(ringoutId) {
    const response = await api.get(`/api/integrations/ringcentral/call/${ringoutId}`);
    return response.data;
  },

  async cancelRingOut(ringoutId) {
    const response = await api.delete(`/api/integrations/ringcentral/call/${ringoutId}`);
    return response.data;
  },

  // ============================================================================
  // PHONE SYSTEM MANAGEMENT
  // ============================================================================

  async getPhoneNumbers() {
    const response = await api.get('/api/integrations/ringcentral/phone-numbers');
    return response.data;
  },

  async getExtensionPhoneNumbers(extensionId = '~') {
    const response = await api.get(`/api/integrations/ringcentral/extensions/${extensionId}/phone-numbers`);
    return response.data;
  },

  async getExtensionDetails(extensionId = '~') {
    const response = await api.get(`/api/integrations/ringcentral/extensions/${extensionId}`);
    return response.data;
  },

  async getExtensionDevices(extensionId = '~') {
    const response = await api.get(`/api/integrations/ringcentral/extensions/${extensionId}/devices`);
    return response.data;
  },

  // Presence
  async getPresence(extensionId = '~') {
    const response = await api.get(`/api/integrations/ringcentral/extensions/${extensionId}/presence`);
    return response.data;
  },

  async updatePresence(extensionId, status) {
    const response = await api.put(`/api/integrations/ringcentral/extensions/${extensionId}/presence`, { status });
    return response.data;
  },

  // Active Calls
  async getActiveCalls(extensionId = '~') {
    const response = await api.get(`/api/integrations/ringcentral/extensions/${extensionId}/active-calls`);
    return response.data;
  },

  // Caller ID
  async getCallerIdSettings(extensionId = '~') {
    const response = await api.get(`/api/integrations/ringcentral/extensions/${extensionId}/caller-id`);
    return response.data;
  },

  async updateCallerIdSettings(extensionId, settings) {
    const response = await api.put(`/api/integrations/ringcentral/extensions/${extensionId}/caller-id`, settings);
    return response.data;
  },

  // Forwarding
  async getForwardingNumbers(extensionId = '~') {
    const response = await api.get(`/api/integrations/ringcentral/extensions/${extensionId}/forwarding`);
    return response.data;
  },

  // Call Handling Rules
  async getCallHandlingRules(extensionId = '~') {
    const response = await api.get(`/api/integrations/ringcentral/extensions/${extensionId}/rules`);
    return response.data;
  },

  // ============================================================================
  // CALL QUEUES & IVR
  // ============================================================================

  async getCallQueues() {
    const response = await api.get('/api/integrations/ringcentral/queues');
    return response.data;
  },

  async getCallQueueMembers(queueId) {
    const response = await api.get(`/api/integrations/ringcentral/queues/${queueId}/members`);
    return response.data;
  },

  async getIvrMenus() {
    const response = await api.get('/api/integrations/ringcentral/ivr-menus');
    return response.data;
  },

  // ============================================================================
  // VOICEMAIL
  // ============================================================================

  async getVoicemails(extensionId = '~', params = {}) {
    const response = await api.get(`/api/integrations/ringcentral/voicemails`, {
      params: { extensionId, ...params },
    });
    return response.data;
  },

  async getVoicemailContent(messageId, attachmentId, extensionId = '~') {
    const response = await api.get(
      `/api/integrations/ringcentral/voicemails/${messageId}/content/${attachmentId}`,
      { params: { extensionId } }
    );
    return response.data;
  },

  // ============================================================================
  // AI FEATURES
  // ============================================================================

  async getAiFeatures() {
    const response = await api.get('/api/integrations/ringcentral/ai/features');
    return response.data;
  },

  async analyzeCall(callId) {
    const response = await api.post(`/api/integrations/ringcentral/calls/${callId}/analyze`);
    return response.data;
  },

  async getCoachingInsights(callId) {
    const response = await api.get(`/api/integrations/ringcentral/calls/${callId}/coaching`);
    return response.data;
  },

  async getComplianceCheck(callId) {
    const response = await api.get(`/api/integrations/ringcentral/calls/${callId}/compliance`);
    return response.data;
  },

  // ============================================================================
  // RECORDING & TRANSCRIPTION
  // ============================================================================

  async getRecording(callId) {
    const response = await api.get(`/api/integrations/ringcentral/calls/${callId}/recording`);
    return response.data;
  },

  async requestTranscription(callId) {
    const response = await api.post(`/api/integrations/ringcentral/calls/${callId}/transcribe`);
    return response.data;
  },

  // ============================================================================
  // RECORD LINKING
  // ============================================================================

  async linkCallToRecord(callId, data) {
    const response = await api.post(`/api/integrations/ringcentral/calls/${callId}/link`, data);
    return response.data;
  },

  // ============================================================================
  // CALL LOGGING (App Connect Connector)
  // ============================================================================

  /**
   * Create a call log entry in Panda CRM
   * This is called automatically when calls end via RingCentral Embeddable
   */
  async createCallLog(data) {
    const response = await api.post('/api/ringcentral/create-call-log', data);
    return response.data;
  },

  /**
   * Find contact/lead by phone number for call pop
   */
  async findContactByPhone(phoneNumber) {
    const response = await api.get('/api/ringcentral/find-contact', {
      params: { phoneNumber },
    });
    return response.data;
  },

  // ============================================================================
  // RINGCX CONTACT CENTER APIs
  // ============================================================================

  // RingCX Status
  async getRingCxStatus() {
    const response = await api.get('/api/integrations/ringcentral/ringcx/status');
    return response.data;
  },

  // ----- AGENT GROUPS -----
  async getRingCxAgentGroups() {
    const response = await api.get('/api/integrations/ringcentral/ringcx/agent-groups');
    return response.data;
  },

  async getRingCxAgentGroup(groupId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/agent-groups/${groupId}`);
    return response.data;
  },

  async getRingCxAgents(groupId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/agent-groups/${groupId}/agents`);
    return response.data;
  },

  async updateRingCxAgentStatus(agentId, status) {
    const response = await api.put(`/api/integrations/ringcentral/ringcx/agents/${agentId}/status`, { status });
    return response.data;
  },

  // ----- GATE GROUPS (Inbound Queues) -----
  async getRingCxGateGroups() {
    const response = await api.get('/api/integrations/ringcentral/ringcx/gate-groups');
    return response.data;
  },

  async getRingCxGateGroup(groupId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/gate-groups/${groupId}`);
    return response.data;
  },

  async getRingCxGates(groupId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/gate-groups/${groupId}/gates`);
    return response.data;
  },

  async getRingCxGateStats(gateId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/gates/${gateId}/stats`);
    return response.data;
  },

  // ----- DIAL GROUPS (Outbound Campaigns) -----
  async getRingCxDialGroups() {
    const response = await api.get('/api/integrations/ringcentral/ringcx/dial-groups');
    return response.data;
  },

  async getRingCxDialGroup(groupId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/dial-groups/${groupId}`);
    return response.data;
  },

  async updateRingCxDialGroup(groupId, data) {
    const response = await api.put(`/api/integrations/ringcentral/ringcx/dial-groups/${groupId}`, data);
    return response.data;
  },

  async getRingCxDialGroupStats(groupId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/dial-groups/${groupId}/stats`);
    return response.data;
  },

  // ----- CAMPAIGNS -----
  async getRingCxCampaigns(dialGroupId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/dial-groups/${dialGroupId}/campaigns`);
    return response.data;
  },

  async getRingCxCampaign(campaignId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/campaigns/${campaignId}`);
    return response.data;
  },

  async createRingCxCampaign(dialGroupId, data) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/dial-groups/${dialGroupId}/campaigns`, data);
    return response.data;
  },

  async updateRingCxCampaign(dialGroupId, campaignId, data) {
    const response = await api.put(`/api/integrations/ringcentral/ringcx/dial-groups/${dialGroupId}/campaigns/${campaignId}`, data);
    return response.data;
  },

  async deleteRingCxCampaign(dialGroupId, campaignId) {
    const response = await api.delete(`/api/integrations/ringcentral/ringcx/dial-groups/${dialGroupId}/campaigns/${campaignId}`);
    return response.data;
  },

  // ----- CAMPAIGN CONTROL -----
  async startRingCxCampaign(dialGroupId, campaignId) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/dial-groups/${dialGroupId}/campaigns/${campaignId}/start`);
    return response.data;
  },

  async pauseRingCxCampaign(dialGroupId, campaignId) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/dial-groups/${dialGroupId}/campaigns/${campaignId}/pause`);
    return response.data;
  },

  async stopRingCxCampaign(dialGroupId, campaignId) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/dial-groups/${dialGroupId}/campaigns/${campaignId}/stop`);
    return response.data;
  },

  // ----- CAMPAIGN LEADS -----
  async getRingCxCampaignLeads(campaignId, params = {}) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/campaigns/${campaignId}/leads`, { params });
    return response.data;
  },

  async uploadRingCxCampaignLeads(campaignId, leads) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/campaigns/${campaignId}/leads`, { leads });
    return response.data;
  },

  async updateRingCxLead(campaignId, leadId, data) {
    const response = await api.put(`/api/integrations/ringcentral/ringcx/campaigns/${campaignId}/leads/${leadId}`, data);
    return response.data;
  },

  async deleteRingCxLead(campaignId, leadId) {
    const response = await api.delete(`/api/integrations/ringcentral/ringcx/campaigns/${campaignId}/leads/${leadId}`);
    return response.data;
  },

  // ----- ACTIVE CALLS & SUPERVISOR CONTROLS -----
  async getRingCxActiveCalls() {
    const response = await api.get('/api/integrations/ringcentral/ringcx/active-calls');
    return response.data;
  },

  async bargeRingCxCall(sessionId, data) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/active-calls/${sessionId}/barge`, data);
    return response.data;
  },

  async coachRingCxCall(sessionId, data) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/active-calls/${sessionId}/coach`, data);
    return response.data;
  },

  async monitorRingCxCall(sessionId) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/active-calls/${sessionId}/monitor`);
    return response.data;
  },

  async transferRingCxCall(sessionId, data) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/active-calls/${sessionId}/transfer`, data);
    return response.data;
  },

  async holdRingCxCall(sessionId, hold = true) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/active-calls/${sessionId}/hold`, { hold });
    return response.data;
  },

  async hangupRingCxCall(sessionId) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/active-calls/${sessionId}/hangup`);
    return response.data;
  },

  async recordRingCxCall(sessionId, record = true) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/active-calls/${sessionId}/record`, { record });
    return response.data;
  },

  // ----- SCRIPTS -----
  async getRingCxScripts() {
    const response = await api.get('/api/integrations/ringcentral/ringcx/scripts');
    return response.data;
  },

  async getRingCxScript(scriptId) {
    const response = await api.get(`/api/integrations/ringcentral/ringcx/scripts/${scriptId}`);
    return response.data;
  },

  // ----- DISPOSITIONS -----
  async getRingCxDispositions() {
    const response = await api.get('/api/integrations/ringcentral/ringcx/dispositions');
    return response.data;
  },

  // ----- CRM SYNC -----
  /**
   * Sync leads from CRM call list to RingCX campaign
   * @param {string} campaignId - RingCX campaign ID
   * @param {Object} options - Sync options (callListId or leadIds)
   */
  async syncCallListToRingCxCampaign(campaignId, options) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/campaigns/${campaignId}/sync-from-crm`, options);
    return response.data;
  },

  /**
   * Sync specific lead IDs to RingCX campaign
   */
  async syncLeadsToRingCxCampaign(campaignId, leadIds) {
    const response = await api.post(`/api/integrations/ringcentral/ringcx/campaigns/${campaignId}/sync-from-crm`, { leadIds });
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

  // ============================================================================
  // DOCUMENT REPOSITORY - List all documents with job linkage
  // ============================================================================

  // Get all documents with pagination, filtering, and search
  async getDocuments(params = {}) {
    const response = await api.get('/api/documents/repository', { params });
    return response.data;
  },

  // Get repository statistics (total docs, storage used, by file type, etc.)
  async getRepositoryStats() {
    const response = await api.get('/api/documents/repository/stats');
    return response.data;
  },

  // Get single document with all linked records
  async getDocument(id) {
    const response = await api.get(`/api/documents/repository/${id}`);
    return response.data;
  },

  // Get all documents for a specific job/opportunity
  async getDocumentsByJob(opportunityId, options = {}) {
    const params = {};
    if (options.includeAccountDocs !== undefined) {
      params.includeAccountDocs = options.includeAccountDocs;
    }
    const response = await api.get(`/api/documents/repository/by-job/${opportunityId}`, { params });
    return response.data;
  },
};

// ==========================================
// PANDASIGN AGREEMENTS API
// ==========================================
export const agreementsApi = {
  // Get all agreements with optional filters
  async getAgreements(params = {}) {
    const response = await api.get('/api/documents/agreements', { params });
    return response.data;
  },

  // Get single agreement by ID
  async getAgreement(id) {
    const response = await api.get(`/api/documents/agreements/${id}`);
    return response.data;
  },

  // Create a new agreement from template
  async createAgreement(data) {
    const response = await api.post('/api/documents/agreements', data);
    return response.data;
  },

  // Send agreement for signature
  async sendAgreement(id) {
    const response = await api.post(`/api/documents/agreements/${id}/send`);
    return response.data;
  },

  // Resend signing email
  async resendAgreement(id) {
    const response = await api.post(`/api/documents/agreements/${id}/resend`);
    return response.data;
  },

  // Void an agreement
  async voidAgreement(id, reason) {
    const response = await api.post(`/api/documents/agreements/${id}/void`, { reason });
    return response.data;
  },

  // Delete a draft agreement
  async deleteAgreement(id) {
    const response = await api.delete(`/api/documents/agreements/${id}`);
    return response.data;
  },

  // Get agreement templates
  async getTemplates(params = {}) {
    const response = await api.get('/api/documents/agreements/templates', { params });
    return response.data;
  },

  // Get single template
  async getTemplate(id) {
    const response = await api.get(`/api/documents/agreements/templates/${id}`);
    return response.data;
  },

  // Create template (admin)
  async createTemplate(data) {
    const response = await api.post('/api/documents/agreements/templates', data);
    return response.data;
  },

  // Update template (admin)
  async updateTemplate(id, data) {
    const response = await api.put(`/api/documents/agreements/templates/${id}`, data);
    return response.data;
  },

  // Delete template (admin)
  async deleteTemplate(id) {
    const response = await api.delete(`/api/documents/agreements/templates/${id}`);
    return response.data;
  },

  // Get agreement statistics
  async getStats(params = {}) {
    const response = await api.get('/api/documents/agreements/stats', { params });
    return response.data;
  },

  // Create and optionally send contract from quote (convenience method)
  async createContractFromQuote(quoteId, options = {}) {
    // First create signable quote
    const result = await documentsApi.createSignableQuote(quoteId, {
      recipientEmail: options.recipientEmail,
      recipientName: options.recipientName,
      sendImmediately: options.sendImmediately || false,
    });
    return result;
  },

  // Create contract from template for opportunity
  async createContractForOpportunity(opportunityId, options = {}) {
    const response = await api.post('/api/documents/agreements', {
      templateId: options.templateId,
      opportunityId,
      accountId: options.accountId,
      contactId: options.contactId,
      recipientEmail: options.recipientEmail,
      recipientName: options.recipientName,
      mergeData: options.mergeData || {},
    });

    // Optionally send immediately
    if (options.sendImmediately && response.data?.id) {
      await api.post(`/api/documents/agreements/${response.data.id}/send`);
    }

    return response.data;
  },

  // ==========================================
  // HOST SIGNING (In-person counter-signature)
  // ==========================================

  // Initiate host signing session for agent to counter-sign
  async initiateHostSigning(agreementId, hostInfo) {
    const response = await api.post(`/api/documents/agreements/${agreementId}/host-sign`, {
      hostName: hostInfo.name,
      hostEmail: hostInfo.email,
    });
    return response.data;
  },

  // Get agreement for host signing (by token)
  async getAgreementForHostSigning(token) {
    const response = await api.get(`/api/documents/agreements/host-sign/${token}`);
    return response.data;
  },

  // Apply host signature
  async applyHostSignature(token, signatureData, signerInfo = {}) {
    const response = await api.post(`/api/documents/agreements/host-sign/${token}`, {
      signatureData,
      signerName: signerInfo.name,
      signerEmail: signerInfo.email,
    });
    return response.data;
  },

  // ==========================================
  // SIGNABLE DOCUMENTS (Change Orders, Quotes, etc.)
  // ==========================================

  // Create a signable document (change order, quote, contract, etc.)
  async createSignableDocument(data) {
    const response = await api.post('/api/documents/agreements/signable', {
      templateId: data.templateId,
      type: data.type, // CHANGE_ORDER, CONTRACT, QUOTE, etc.
      opportunityId: data.opportunityId,
      accountId: data.accountId,
      contactId: data.contactId,
      recipientName: data.recipientName,
      recipientEmail: data.recipientEmail,
      mergeData: data.mergeData || {},
      sendImmediately: data.sendImmediately || false,
    });
    return response.data;
  },

  // Create change order for opportunity
  async createChangeOrder(opportunityId, data) {
    const response = await api.post(`/api/documents/agreements/change-order`, {
      opportunityId,
      accountId: data.accountId,
      recipientName: data.recipientName,
      recipientEmail: data.recipientEmail,
      originalAmount: data.originalAmount,
      amendmentAmount: data.amendmentAmount,
      newTotal: data.newTotal,
      changeDescription: data.changeDescription,
      lineItems: data.lineItems,
      sendImmediately: data.sendImmediately || true,
    });
    return response.data;
  },
};

// ==========================================
// SETUP / MODULE MANAGER API
// ==========================================
export const setupApi = {
  // Get all modules
  async getModules() {
    const response = await api.get('/api/setup/modules');
    return response.data;
  },

  // Get module details including fields
  async getModule(moduleId) {
    const response = await api.get(`/api/setup/modules/${moduleId}`);
    return response.data;
  },

  // Get fields for a module (both standard and custom)
  async getModuleFields(moduleId) {
    const response = await api.get(`/api/setup/modules/${moduleId}/fields`);
    return response.data;
  },

  // Create a custom field
  async createCustomField(moduleId, fieldData) {
    const response = await api.post(`/api/setup/modules/${moduleId}/fields`, fieldData);
    return response.data;
  },

  // Update a custom field
  async updateCustomField(moduleId, fieldId, fieldData) {
    const response = await api.put(`/api/setup/modules/${moduleId}/fields/${fieldId}`, fieldData);
    return response.data;
  },

  // Delete a custom field
  async deleteCustomField(moduleId, fieldId) {
    const response = await api.delete(`/api/setup/modules/${moduleId}/fields/${fieldId}`);
    return response.data;
  },

  // Get picklist values for a field
  async getPicklistValues(moduleId, fieldApiName) {
    const response = await api.get(`/api/setup/modules/${moduleId}/fields/${fieldApiName}/picklist`);
    return response.data;
  },

  // Update picklist values
  async updatePicklistValues(moduleId, fieldApiName, values) {
    const response = await api.put(`/api/setup/modules/${moduleId}/fields/${fieldApiName}/picklist`, { values });
    return response.data;
  },

  // Get page layouts for a module
  async getPageLayouts(moduleId) {
    const response = await api.get(`/api/setup/modules/${moduleId}/layouts`);
    return response.data;
  },

  // Update page layout
  async updatePageLayout(moduleId, layoutId, layoutData) {
    const response = await api.put(`/api/setup/modules/${moduleId}/layouts/${layoutId}`, layoutData);
    return response.data;
  },

  // Get validation rules for a module
  async getValidationRules(moduleId) {
    const response = await api.get(`/api/setup/modules/${moduleId}/validation-rules`);
    return response.data;
  },

  // Create validation rule
  async createValidationRule(moduleId, ruleData) {
    const response = await api.post(`/api/setup/modules/${moduleId}/validation-rules`, ruleData);
    return response.data;
  },

  // Update validation rule
  async updateValidationRule(moduleId, ruleId, ruleData) {
    const response = await api.put(`/api/setup/modules/${moduleId}/validation-rules/${ruleId}`, ruleData);
    return response.data;
  },

  // Delete validation rule
  async deleteValidationRule(moduleId, ruleId) {
    const response = await api.delete(`/api/setup/modules/${moduleId}/validation-rules/${ruleId}`);
    return response.data;
  },
};

// ============================================================================
// TASKS API
// ============================================================================
export const tasksApi = {
  // List tasks with filters
  async getTasks(params = {}) {
    const response = await api.get('/api/tasks', { params });
    return response.data;
  },

  // Get current user's tasks for dashboard
  async getMyTasks(limit = 20) {
    const response = await api.get('/api/tasks/my-tasks', { params: { limit } });
    return response.data;
  },

  // Get task subject options
  async getSubjects() {
    const response = await api.get('/api/tasks/subjects');
    return response.data.data;
  },

  // Get tasks for an opportunity
  async getOpportunityTasks(opportunityId, showCompleted = false) {
    const response = await api.get(`/api/tasks/opportunity/${opportunityId}`, {
      params: { showCompleted },
    });
    return response.data.data;
  },

  // Get tasks for a lead
  async getLeadTasks(leadId, showCompleted = false) {
    const response = await api.get(`/api/tasks/lead/${leadId}`, {
      params: { showCompleted },
    });
    return response.data.data;
  },

  // Get single task
  async getTask(id) {
    const response = await api.get(`/api/tasks/${id}`);
    return response.data.data;
  },

  // Create task
  async createTask(data) {
    const response = await api.post('/api/tasks', data);
    return response.data.data;
  },

  // Update task
  async updateTask(id, data) {
    const response = await api.put(`/api/tasks/${id}`, data);
    return response.data.data;
  },

  // Delete task
  async deleteTask(id) {
    const response = await api.delete(`/api/tasks/${id}`);
    return response.data;
  },

  // Mark task as completed
  async completeTask(id) {
    const response = await api.post(`/api/tasks/${id}/complete`);
    return response.data.data;
  },

  // Create follow-up task
  async createFollowUp(taskId, data) {
    const response = await api.post(`/api/tasks/${taskId}/follow-up`, data);
    return response.data.data;
  },
};

// ============================================================================
// MODULES API - Cross-Module Reporting
// ============================================================================

export const modulesApi = {
  // Get all available modules for reporting
  async getModules() {
    const response = await api.get('/api/modules');
    return response.data;
  },

  // Get detailed information about a specific module
  async getModule(moduleName) {
    const response = await api.get(`/api/modules/${moduleName}`);
    return response.data;
  },

  // Get available fields for a module with optional filtering
  async getModuleFields(moduleName, options = {}) {
    const response = await api.get(`/api/modules/${moduleName}/fields`, { params: options });
    return response.data;
  },

  // Get relationships for a module (for cross-module joins)
  async getModuleRelationships(moduleName) {
    const response = await api.get(`/api/modules/${moduleName}/relationships`);
    return response.data;
  },

  // Get fields from a related module
  async getRelatedModuleFields(moduleName, relationshipPath) {
    const response = await api.get(`/api/modules/${moduleName}/related-fields/${relationshipPath}`);
    return response.data;
  },

  // Get predefined metrics for a module
  async getModuleMetrics(moduleName) {
    const response = await api.get(`/api/modules/${moduleName}/metrics`);
    return response.data;
  },

  // Get quick summary stats for a module
  async getModuleSummary(moduleName, filters = []) {
    const response = await api.get(`/api/modules/${moduleName}/summary`, {
      params: { filters: JSON.stringify(filters) },
    });
    return response.data;
  },

  // Execute a report query against a module
  async queryModule(moduleName, queryConfig) {
    const response = await api.post(`/api/modules/${moduleName}/query`, queryConfig);
    return response.data;
  },

  // Execute a cross-module join query
  async crossModuleQuery(queryConfig) {
    const response = await api.post('/api/modules/cross-query', queryConfig);
    return response.data;
  },

  // Get time series data for a module
  async getTimeSeries(moduleName, options) {
    const response = await api.post(`/api/modules/${moduleName}/time-series`, options);
    return response.data;
  },

  // Get available filter operators
  async getFilterOperators() {
    const response = await api.get('/api/modules/filter/operators');
    return response.data;
  },
};

// Call Lists API - Call Center Management
export const callListsApi = {
  // ==================== CALL LISTS ====================

  // Get all call lists with stats
  async getLists(filters = {}) {
    const params = new URLSearchParams();
    if (filters.isActive !== undefined) params.append('isActive', filters.isActive);
    if (filters.listType) params.append('listType', filters.listType);
    if (filters.assignedUserId) params.append('assignedUserId', filters.assignedUserId);
    if (filters.states?.length) params.append('states', filters.states.join(','));

    const response = await api.get(`/api/leads/call-lists?${params.toString()}`);
    return response.data;
  },

  // Get a single call list with stats and dispositions
  async getList(id) {
    const response = await api.get(`/api/leads/call-lists/${id}`);
    return response.data;
  },

  // Create a new call list
  async createList(data) {
    const response = await api.post('/api/leads/call-lists', data);
    return response.data;
  },

  // Update a call list
  async updateList(id, data) {
    const response = await api.put(`/api/leads/call-lists/${id}`, data);
    return response.data;
  },

  // Delete (deactivate) a call list
  async deleteList(id) {
    const response = await api.delete(`/api/leads/call-lists/${id}`);
    return response.data;
  },

  // Refresh a dynamic list
  async refreshList(id) {
    const response = await api.post(`/api/leads/call-lists/${id}/refresh`);
    return response.data;
  },

  // Initialize predefined Five9-style lists
  async initPredefinedLists() {
    const response = await api.post('/api/leads/call-lists/predefined/init');
    return response.data;
  },

  // ==================== MANAGER DASHBOARD ====================

  // Get comprehensive dashboard stats for call center manager
  async getDashboardStats() {
    const response = await api.get('/api/leads/call-lists/dashboard');
    return response.data;
  },

  // Bulk assign leads to a team member
  async bulkAssign(itemIds, assignToUserId) {
    const response = await api.post('/api/leads/call-lists/bulk-assign', {
      itemIds,
      assignToUserId,
    });
    return response.data;
  },

  // ==================== CALL LIST ITEMS ====================

  // Get items for a call list
  async getItems(listId, options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options.assignedToId) params.append('assignedToId', options.assignedToId);

    const response = await api.get(`/api/leads/call-lists/${listId}/items?${params.toString()}`);
    return response.data;
  },

  // Get next item to call
  async getNextItem(listId) {
    const response = await api.get(`/api/leads/call-lists/${listId}/next`);
    return response.data;
  },

  // Add items to a list
  async addItems(listId, items) {
    const response = await api.post(`/api/leads/call-lists/${listId}/items`, { items });
    return response.data;
  },

  // Remove an item from a list
  async removeItem(listId, itemId) {
    const response = await api.delete(`/api/leads/call-lists/${listId}/items/${itemId}`);
    return response.data;
  },

  // Move an item to another list
  async moveItem(listId, itemId, targetListId, reason) {
    const response = await api.post(`/api/leads/call-lists/${listId}/items/${itemId}/move`, {
      targetListId,
      reason,
    });
    return response.data;
  },

  // Apply a disposition to an item
  async applyDisposition(listId, itemId, dispositionCode, notes) {
    const response = await api.post(`/api/leads/call-lists/${listId}/items/${itemId}/disposition`, {
      dispositionCode,
      notes,
    });
    return response.data;
  },

  // ==================== DISPOSITIONS ====================

  // Get global dispositions
  async getGlobalDispositions() {
    const response = await api.get('/api/leads/call-lists/dispositions/global');
    return response.data;
  },

  // Get dispositions for a specific list
  async getListDispositions(listId) {
    const response = await api.get(`/api/leads/call-lists/${listId}/dispositions`);
    return response.data;
  },

  // Create a disposition
  async createDisposition(data) {
    const response = await api.post('/api/leads/call-lists/dispositions', data);
    return response.data;
  },

  // Update a disposition
  async updateDisposition(id, data) {
    const response = await api.put(`/api/leads/call-lists/dispositions/${id}`, data);
    return response.data;
  },

  // ==================== SESSIONS ====================

  // Start a new call session
  async startSession(listId, dialerMode = 'PREVIEW') {
    const response = await api.post('/api/leads/call-lists/sessions/start', {
      listId,
      dialerMode,
    });
    return response.data;
  },

  // End a session
  async endSession(sessionId, reason) {
    const response = await api.post(`/api/leads/call-lists/sessions/${sessionId}/end`, { reason });
    return response.data;
  },

  // Toggle pause on a session
  async togglePause(sessionId) {
    const response = await api.post(`/api/leads/call-lists/sessions/${sessionId}/pause`);
    return response.data;
  },

  // Get active session
  async getActiveSession() {
    const response = await api.get('/api/leads/call-lists/sessions/active');
    return response.data;
  },

  // Get session stats
  async getSessionStats(userId, startDate, endDate) {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await api.get(`/api/leads/call-lists/sessions/stats?${params.toString()}`);
    return response.data;
  },

  // Record call completion
  async recordCallComplete(sessionId, callData) {
    const response = await api.post(`/api/leads/call-lists/sessions/${sessionId}/call-complete`, callData);
    return response.data;
  },

  // ==================== LIST POPULATION ====================

  // Trigger full list population job
  async populateLists(options = {}) {
    const response = await api.post('/api/leads/call-lists/populate', options);
    return response.data;
  },

  // Populate a specific list type
  // listType: hotLeads, leadReset, coldLeads, callbacks, coolDown, confirmation, rehash, reset
  async populateListType(listType, options = {}) {
    const response = await api.post(`/api/leads/call-lists/populate/${listType}`, options);
    return response.data;
  },

  // Apply a disposition to a lead and route to appropriate list
  async applyLeadDisposition(leadId, dispositionCode, options = {}) {
    const response = await api.post(`/api/leads/call-lists/disposition/${leadId}`, {
      dispositionCode,
      ...options,
    });
    return response.data;
  },
};

// Champions/Referral API
export const championsApi = {
  // ==================== CHAMPIONS ====================
  async getChampions(params = {}) {
    const response = await api.get('/api/champions', { params });
    return response.data;
  },

  async getChampion(id) {
    const response = await api.get(`/api/champions/${id}`);
    return response.data.data;
  },

  async createChampion(data) {
    const response = await api.post('/api/champions', data);
    return response.data.data;
  },

  async updateChampion(id, data) {
    const response = await api.put(`/api/champions/${id}`, data);
    return response.data.data;
  },

  async deleteChampion(id) {
    const response = await api.delete(`/api/champions/${id}`);
    return response.data;
  },

  async getChampionStats(id) {
    const response = await api.get(`/api/champions/${id}/stats`);
    return response.data.data;
  },

  async getChampionActivity(id, params = {}) {
    const response = await api.get(`/api/champions/${id}/activity`, { params });
    return response.data.data;
  },

  async inviteChampion(data) {
    const response = await api.post('/api/champions/invite', data);
    return response.data.data;
  },

  async resendInvite(id) {
    const response = await api.post(`/api/champions/${id}/resend-invite`);
    return response.data;
  },

  async updateChampionStatus(id, status) {
    const response = await api.put(`/api/champions/${id}/status`, { status });
    return response.data.data;
  },

  // ==================== REFERRALS ====================
  async getReferrals(params = {}) {
    const response = await api.get('/api/referrals', { params });
    return response.data;
  },

  async getReferral(id) {
    const response = await api.get(`/api/referrals/${id}`);
    return response.data.data;
  },

  async updateReferralStatus(id, status, notes) {
    const response = await api.put(`/api/referrals/${id}/status`, { status, notes });
    return response.data.data;
  },

  async getReferralsByChampion(championId, params = {}) {
    const response = await api.get(`/api/referrals/champion/${championId}`, { params });
    return response.data;
  },

  // ==================== WALLETS ====================
  async getWallet(championId) {
    const response = await api.get(`/api/wallets/${championId}`);
    return response.data.data;
  },

  async getWalletTransactions(championId, params = {}) {
    const response = await api.get(`/api/wallets/${championId}/transactions`, { params });
    return response.data;
  },

  async createStripeConnectAccount(championId) {
    const response = await api.post(`/api/wallets/${championId}/stripe-connect`);
    return response.data.data;
  },

  async getStripeOnboardingLink(championId) {
    const response = await api.get(`/api/wallets/${championId}/onboarding-link`);
    return response.data.data;
  },

  async requestPayout(championId, amount) {
    const response = await api.post(`/api/wallets/${championId}/request-payout`, { amount });
    return response.data.data;
  },

  // ==================== PAYOUTS ====================
  async getPayouts(params = {}) {
    const response = await api.get('/api/payouts', { params });
    return response.data;
  },

  async getPendingPayoutsSummary() {
    const response = await api.get('/api/payouts/pending');
    return response.data.data;
  },

  async approvePayout(id, notes) {
    const response = await api.post(`/api/payouts/${id}/approve`, { notes });
    return response.data.data;
  },

  async bulkApprovePayouts(payoutIds, notes) {
    const response = await api.post('/api/payouts/approve', { payoutIds, notes });
    return response.data;
  },

  async processPayouts(payoutIds) {
    const response = await api.post('/api/payouts/process', { payoutIds });
    return response.data;
  },

  async holdPayout(id, reason) {
    const response = await api.put(`/api/payouts/${id}/hold`, { reason });
    return response.data.data;
  },

  async cancelPayout(id, reason) {
    const response = await api.put(`/api/payouts/${id}/cancel`, { reason });
    return response.data.data;
  },

  // ==================== SETTINGS ====================
  async getReferralSettings() {
    const response = await api.get('/api/referral-settings');
    return response.data.data;
  },

  async updateReferralSettings(data) {
    const response = await api.put('/api/referral-settings', data);
    return response.data.data;
  },

  async getPayoutTiers() {
    const response = await api.get('/api/referral-settings/payout-tiers');
    return response.data.data;
  },

  async createPayoutTier(data) {
    const response = await api.post('/api/referral-settings/payout-tiers', data);
    return response.data.data;
  },

  async updatePayoutTier(id, data) {
    const response = await api.put(`/api/referral-settings/payout-tiers/${id}`, data);
    return response.data.data;
  },

  async deletePayoutTier(id) {
    const response = await api.delete(`/api/referral-settings/payout-tiers/${id}`);
    return response.data;
  },

  async getProgramStats() {
    const response = await api.get('/api/referral-settings/stats');
    return response.data.data;
  },

  // ==================== CHAMPION AUTH (Public) ====================
  async registerChampion(data) {
    const response = await api.post('/api/champion-auth/register', data);
    return response.data;
  },

  async loginChampion(email, password) {
    const response = await api.post('/api/champion-auth/login', { email, password });
    return response.data;
  },

  async getInviteDetails(token) {
    const response = await api.get(`/api/champions/invite/${token}`);
    return response.data.data;
  },

  async completeInvite(token, data) {
    const response = await api.post(`/api/champions/complete-invite/${token}`, data);
    return response.data.data;
  },

  // ==================== REPORTS & ANALYTICS ====================
  async getDashboardStats() {
    const response = await api.get('/api/champion-reports/dashboard');
    return response.data.data;
  },

  async getLeaderboard(params = {}) {
    const response = await api.get('/api/champion-reports/leaderboard', { params });
    return response.data.data;
  },

  async getReferralPipeline(params = {}) {
    const response = await api.get('/api/champion-reports/referral-pipeline', { params });
    return response.data.data;
  },

  async getPayoutSummary(params = {}) {
    const response = await api.get('/api/champion-reports/payout-summary', { params });
    return response.data.data;
  },

  async getChampionAnalytics(championId) {
    const response = await api.get(`/api/champion-reports/champion/${championId}`);
    return response.data.data;
  },

  async getProgramTrends(params = {}) {
    const response = await api.get('/api/champion-reports/trends', { params });
    return response.data.data;
  },

  async exportChampions(params = {}) {
    const response = await api.get('/api/champion-reports/export', { params });
    return response.data;
  },
};

// Campaigns API (Email & SMS Marketing)
export const campaignsApi = {
  // Get all campaigns with filters
  async getCampaigns(params = {}) {
    const response = await api.get('/api/campaigns', { params });
    return response.data;
  },

  // Get aggregate campaign statistics
  async getStats() {
    const response = await api.get('/api/campaigns/stats');
    return response.data.data;
  },

  // Get a single campaign by ID
  async getCampaign(id) {
    const response = await api.get(`/api/campaigns/${id}`);
    return response.data.data;
  },

  // Create a new campaign
  async createCampaign(data) {
    const response = await api.post('/api/campaigns', data);
    return response.data.data;
  },

  // Update a campaign
  async updateCampaign(id, data) {
    const response = await api.put(`/api/campaigns/${id}`, data);
    return response.data.data;
  },

  // Delete a campaign
  async deleteCampaign(id) {
    const response = await api.delete(`/api/campaigns/${id}`);
    return response.data;
  },

  // Send a campaign
  async sendCampaign(id) {
    const response = await api.post(`/api/campaigns/${id}/send`);
    return response.data.data;
  },

  // Pause a campaign
  async pauseCampaign(id) {
    const response = await api.post(`/api/campaigns/${id}/pause`);
    return response.data.data;
  },

  // Resume a paused campaign
  async resumeCampaign(id) {
    const response = await api.post(`/api/campaigns/${id}/resume`);
    return response.data.data;
  },

  // Duplicate a campaign
  async duplicateCampaign(id) {
    const response = await api.post(`/api/campaigns/${id}/duplicate`);
    return response.data.data;
  },

  // Estimate recipients for audience rules
  async estimateRecipients(audienceRules) {
    const response = await api.post('/api/campaigns/estimate-recipients', { audienceRules });
    return response.data.data;
  },

  // Get audience preview (sample contacts)
  async getAudiencePreview(audienceRules, limit = 10) {
    const response = await api.post('/api/campaigns/audience-preview', { audienceRules, limit });
    return response.data.data;
  },

  // Get campaign sends with pagination
  async getCampaignSends(campaignId, params = {}) {
    const response = await api.get(`/api/campaigns/${campaignId}/sends`, { params });
    return response.data;
  },

  // Get opportunity stage counts for audience targeting
  async getOpportunityStageCounts() {
    const response = await api.get('/api/campaigns/opportunity-stage-counts');
    return response.data.data;
  },
};

// Message Templates API
export const templatesApi = {
  // Get all templates
  async getTemplates(params = {}) {
    const response = await api.get('/api/message-templates', { params });
    return response.data;
  },

  // Get a single template
  async getTemplate(id) {
    const response = await api.get(`/api/message-templates/${id}`);
    return response.data.data;
  },

  // Create a new template
  async createTemplate(data) {
    const response = await api.post('/api/message-templates', data);
    return response.data.data;
  },

  // Update a template
  async updateTemplate(id, data) {
    const response = await api.put(`/api/message-templates/${id}`, data);
    return response.data.data;
  },

  // Delete a template
  async deleteTemplate(id) {
    const response = await api.delete(`/api/message-templates/${id}`);
    return response.data;
  },

  // Get template categories
  async getCategories() {
    const response = await api.get('/api/message-templates/categories');
    return response.data.data;
  },
};

// ==========================================
// PHOTOCAM API - Photo Management System
// ==========================================
export const photocamApi = {
  // ==================== PROJECTS ====================
  async getProjects(params = {}) {
    const response = await api.get('/api/photocam/projects', { params });
    return response.data;
  },

  async getProject(id) {
    const response = await api.get(`/api/photocam/projects/${id}`);
    return response.data.data;
  },

  async createProject(data) {
    const response = await api.post('/api/photocam/projects', data);
    return response.data.data;
  },

  async updateProject(id, data) {
    const response = await api.put(`/api/photocam/projects/${id}`, data);
    return response.data.data;
  },

  async deleteProject(id) {
    const response = await api.delete(`/api/photocam/projects/${id}`);
    return response.data;
  },

  // Get or create project for an opportunity
  async getProjectForOpportunity(opportunityId) {
    const response = await api.get(`/api/photocam/projects/opportunity/${opportunityId}`);
    return response.data.data;
  },

  // ==================== PHOTOS ====================
  async getPhotos(projectId, params = {}) {
    const response = await api.get(`/api/photocam/photos/project/${projectId}`, { params });
    return response.data;
  },

  async getPhoto(id) {
    const response = await api.get(`/api/photocam/photos/${id}`);
    return response.data.data;
  },

  async uploadPhoto(projectId, file, metadata = {}) {
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('projectId', projectId);
    if (metadata.type) formData.append('type', metadata.type);
    if (metadata.caption) formData.append('caption', metadata.caption);
    if (metadata.tags) formData.append('tags', JSON.stringify(metadata.tags));

    const response = await api.post('/api/photocam/photos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  async uploadMultiplePhotos(projectId, files, metadata = {}) {
    const formData = new FormData();
    formData.append('projectId', projectId);
    files.forEach((file) => formData.append('photos', file));
    if (metadata.type) formData.append('type', metadata.type);
    if (metadata.tags) formData.append('tags', JSON.stringify(metadata.tags));

    const response = await api.post('/api/photocam/photos/upload-multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  async updatePhoto(id, data) {
    const response = await api.put(`/api/photocam/photos/${id}`, data);
    return response.data.data;
  },

  async deletePhoto(id) {
    const response = await api.delete(`/api/photocam/photos/${id}`);
    return response.data;
  },

  async getPhotoDownloadUrl(id, variant = 'original') {
    const response = await api.get(`/api/photocam/photos/${id}/download`, {
      params: { variant },
    });
    return response.data.data.url;
  },

  // ==================== ANNOTATIONS ====================
  async getAnnotations(photoId) {
    const response = await api.get(`/api/photocam/annotations/photo/${photoId}`);
    return response.data.data;
  },

  async createAnnotation(photoId, data) {
    const response = await api.post(`/api/photocam/photos/${photoId}/annotations`, data);
    return response.data.data;
  },

  async updateAnnotation(id, data) {
    const response = await api.put(`/api/photocam/annotations/${id}`, data);
    return response.data.data;
  },

  async deleteAnnotation(id) {
    const response = await api.delete(`/api/photocam/annotations/${id}`);
    return response.data;
  },

  // ==================== CHECKLISTS ====================
  async getChecklists(projectId) {
    const response = await api.get(`/api/photocam/checklists/project/${projectId}`);
    return response.data.data;
  },

  async getChecklist(id) {
    const response = await api.get(`/api/photocam/checklists/${id}`);
    return response.data.data;
  },

  async createChecklist(projectId, data) {
    const response = await api.post(`/api/photocam/projects/${projectId}/checklists`, data);
    return response.data.data;
  },

  async updateChecklist(id, data) {
    const response = await api.put(`/api/photocam/checklists/${id}`, data);
    return response.data.data;
  },

  async updateChecklistItem(checklistId, itemId, data) {
    const response = await api.put(`/api/photocam/checklists/${checklistId}/items/${itemId}`, data);
    return response.data.data;
  },

  async attachPhotoToChecklistItem(checklistId, itemId, photoId) {
    const response = await api.post(
      `/api/photocam/checklists/${checklistId}/items/${itemId}/photos`,
      { photoId }
    );
    return response.data.data;
  },

  // ==================== TEMPLATES ====================
  async getTemplates(params = {}) {
    const response = await api.get('/api/photocam/templates', { params });
    return response.data.data;
  },

  async getTemplate(id) {
    const response = await api.get(`/api/photocam/templates/${id}`);
    return response.data.data;
  },

  async createChecklistFromTemplate(projectId, templateId) {
    const response = await api.post(`/api/photocam/templates/${templateId}/instantiate`, {
      projectId,
    });
    return response.data.data;
  },

  // ==================== BEFORE/AFTER COMPARISONS ====================
  async getComparisons(projectId) {
    const response = await api.get(`/api/photocam/comparisons/project/${projectId}`);
    return response.data.data;
  },

  async getComparison(id) {
    const response = await api.get(`/api/photocam/comparisons/${id}`);
    return response.data.data;
  },

  async createComparison(projectId, data) {
    const response = await api.post(`/api/photocam/projects/${projectId}/comparisons`, data);
    return response.data.data;
  },

  async updateComparison(id, data) {
    const response = await api.put(`/api/photocam/comparisons/${id}`, data);
    return response.data.data;
  },

  async generateComparisonImage(id) {
    const response = await api.post(`/api/photocam/comparisons/${id}/generate`);
    return response.data.data;
  },

  async getComparisonShareLink(id) {
    const response = await api.get(`/api/photocam/comparisons/${id}/share`);
    return response.data.data;
  },

  // ==================== GALLERIES ====================
  async getGalleries(projectId) {
    const response = await api.get(`/api/photocam/galleries/project/${projectId}`);
    return response.data.data;
  },

  async getGallery(id) {
    const response = await api.get(`/api/photocam/galleries/${id}`);
    return response.data.data;
  },

  async createGallery(projectId, data) {
    const response = await api.post(`/api/photocam/projects/${projectId}/galleries`, data);
    return response.data.data;
  },

  async updateGallery(id, data) {
    const response = await api.put(`/api/photocam/galleries/${id}`, data);
    return response.data.data;
  },

  async addPhotosToGallery(galleryId, photoIds) {
    const response = await api.post(`/api/photocam/galleries/${galleryId}/photos`, { photoIds });
    return response.data.data;
  },

  async removePhotoFromGallery(galleryId, photoId) {
    const response = await api.delete(`/api/photocam/galleries/${galleryId}/photos/${photoId}`);
    return response.data;
  },

  async getGalleryShareLink(id) {
    const response = await api.post(`/api/photocam/galleries/${id}/share`);
    return response.data.data;
  },

  // ==================== AI FEATURES ====================
  async generateAIReport(projectId, reportType = 'inspection') {
    const response = await api.post(`/api/photocam/projects/${projectId}/ai/report`, {
      reportType,
    });
    return response.data.data;
  },

  async generateDailyLog(projectId) {
    const response = await api.post(`/api/photocam/projects/${projectId}/ai/daily-log`);
    return response.data.data;
  },

  async getPhotoAIDescription(photoId) {
    const response = await api.post(`/api/photocam/photos/${photoId}/ai/describe`);
    return response.data.data;
  },

  // ==================== PAGES (NOTEBOOK) ====================
  async getPages(projectId) {
    const response = await api.get(`/api/photocam/pages/project/${projectId}`);
    return response.data.data;
  },

  async getPage(id) {
    const response = await api.get(`/api/photocam/pages/${id}`);
    return response.data.data;
  },

  async createPage(projectId, data) {
    const response = await api.post(`/api/photocam/projects/${projectId}/pages`, data);
    return response.data.data;
  },

  async updatePage(id, data) {
    const response = await api.put(`/api/photocam/pages/${id}`, data);
    return response.data.data;
  },

  async deletePage(id) {
    const response = await api.delete(`/api/photocam/pages/${id}`);
    return response.data;
  },

  async exportPageToPdf(id) {
    const response = await api.post(`/api/photocam/pages/${id}/export`);
    return response.data.data;
  },
};

// Orphaned Records API (Migration Management)
export const orphanedRecordsApi = {
  // Get orphaned records with filters
  async getRecords(params = {}) {
    const response = await api.get('/api/workflows/orphaned-records', { params });
    return response.data;
  },

  // Get orphaned records statistics
  async getStats() {
    const response = await api.get('/api/workflows/orphaned-records/stats');
    return response.data;
  },

  // Get single orphaned record
  async getRecord(id) {
    const response = await api.get(`/api/workflows/orphaned-records/${id}`);
    return response.data;
  },

  // Link orphaned record to existing CRM record
  async linkRecord(id, { linkedRecordId, linkedRecordType, userId }) {
    const response = await api.post(`/api/workflows/orphaned-records/${id}/link`, {
      linkedRecordId,
      linkedRecordType,
      userId,
    });
    return response.data;
  },

  // Skip orphaned record (won't be migrated)
  async skipRecord(id, { reason, userId }) {
    const response = await api.post(`/api/workflows/orphaned-records/${id}/skip`, {
      reason,
      userId,
    });
    return response.data;
  },

  // Mark orphaned record as deleted
  async deleteRecord(id, { reason, userId }) {
    const response = await api.post(`/api/workflows/orphaned-records/${id}/delete`, {
      reason,
      userId,
    });
    return response.data;
  },

  // Mark orphaned record for review
  async markForReview(id, { note, userId }) {
    const response = await api.post(`/api/workflows/orphaned-records/${id}/review`, {
      note,
      userId,
    });
    return response.data;
  },

  // Bulk skip orphaned records
  async bulkSkip({ recordIds, reason, userId }) {
    const response = await api.post('/api/workflows/orphaned-records/bulk-skip', {
      recordIds,
      reason,
      userId,
    });
    return response.data;
  },

  // Bulk delete orphaned records
  async bulkDelete({ recordIds, reason, userId }) {
    const response = await api.post('/api/workflows/orphaned-records/bulk-delete', {
      recordIds,
      reason,
      userId,
    });
    return response.data;
  },

  // Get potential matches for orphaned record
  async getPotentialMatches(id) {
    const response = await api.get(`/api/workflows/orphaned-records/${id}/potential-matches`);
    return response.data;
  },
};

export default api;
