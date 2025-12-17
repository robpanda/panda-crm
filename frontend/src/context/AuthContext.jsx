import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        try {
          const userData = await authApi.getCurrentUser(accessToken);
          setUser(userData);
        } catch (error) {
          // Token invalid or expired, clear storage
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('idToken');
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await authApi.login(email, password);

    if (response.challengeName === 'NEW_PASSWORD_REQUIRED') {
      return { challenge: 'NEW_PASSWORD_REQUIRED', session: response.session };
    }

    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    localStorage.setItem('idToken', response.idToken);

    const userData = await authApi.getCurrentUser(response.accessToken);
    setUser(userData);

    return { success: true };
  }, []);

  const completeNewPassword = useCallback(async (email, newPassword, session) => {
    const response = await authApi.completeNewPassword(email, newPassword, session);

    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    localStorage.setItem('idToken', response.idToken);

    const userData = await authApi.getCurrentUser(response.accessToken);
    setUser(userData);

    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      try {
        await authApi.logout(accessToken);
      } catch (error) {
        // Ignore logout errors
      }
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('idToken');
    setUser(null);
  }, []);

  const refreshToken = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem('refreshToken');
    if (!storedRefreshToken) {
      throw new Error('No refresh token');
    }

    const response = await authApi.refreshToken(storedRefreshToken);
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('idToken', response.idToken);

    return response.accessToken;
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    completeNewPassword,
    refreshToken,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
