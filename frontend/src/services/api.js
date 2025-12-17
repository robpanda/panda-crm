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

  async getStageCounts(ownerFilter) {
    const response = await api.get('/api/opportunities/counts', {
      params: { ownerFilter },
    });
    return response.data.data;
  },
};

export default api;
