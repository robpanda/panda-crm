import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, usersApi, rolesApi } from '../services/api';

const AuthContext = createContext(null);

// Key for storing impersonation in session storage
const IMPERSONATION_KEY = 'impersonatedUser';

// Role types for dashboard filtering
export const ROLE_TYPES = {
  ADMIN: 'admin',
  EXECUTIVE: 'executive',
  OFFICE_MANAGER: 'office_manager',
  SALES_MANAGER: 'sales_manager',
  SALES_REP: 'sales_rep',
  PROJECT_MANAGER: 'project_manager',
  CALL_CENTER: 'call_center',
  CALL_CENTER_MANAGER: 'call_center_manager',
  VIEWER: 'viewer',
};

const PANDA_EMPLOYEE_EMAIL_DOMAINS = new Set(['pandaexteriors.com', 'panda-exteriors.com']);

// Map Cognito role names to role types
function getRoleType(roleInput) {
  if (!roleInput) return ROLE_TYPES.SALES_REP;
  // Handle case where role is an object with a name property
  const roleName = typeof roleInput === 'object' ? roleInput?.name : roleInput;
  if (!roleName) return ROLE_TYPES.SALES_REP;
  const role = String(roleName).toLowerCase();
  if (role.includes('super_admin') || role.includes('admin')) return ROLE_TYPES.ADMIN;
  if (role.includes('executive') || role.includes('exec')) return ROLE_TYPES.EXECUTIVE;
  if (role.includes('office_manager') || role.includes('office manager')) return ROLE_TYPES.OFFICE_MANAGER;
  if (role.includes('sales_manager') || role.includes('sales manager')) return ROLE_TYPES.SALES_MANAGER;
  if (role.includes('project_manager') || role.includes('pm')) return ROLE_TYPES.PROJECT_MANAGER;
  if (role.includes('call_center_manager') || role.includes('call center manager')) return ROLE_TYPES.CALL_CENTER_MANAGER;
  if (role.includes('call_center') || role.includes('call center')) return ROLE_TYPES.CALL_CENTER;
  if (role.includes('viewer') || role.includes('read')) return ROLE_TYPES.VIEWER;
  return ROLE_TYPES.SALES_REP;
}

function buildEmailLookupCandidates(email) {
  if (typeof email !== 'string') return [];

  const trimmed = email.trim();
  if (!trimmed) return [];

  const candidates = [];
  const seen = new Set();

  const addCandidate = (value) => {
    const candidate = String(value || '').trim();
    if (!candidate) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  const lowerEmail = trimmed.toLowerCase();
  addCandidate(trimmed);
  addCandidate(lowerEmail);

  const atIndex = lowerEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === lowerEmail.length - 1) {
    return candidates;
  }

  const localPart = lowerEmail.slice(0, atIndex);
  const domainPart = lowerEmail.slice(atIndex + 1);

  addCandidate(`${localPart}@${domainPart}`);

  if (PANDA_EMPLOYEE_EMAIL_DOMAINS.has(domainPart)) {
    const dotlessLocalPart = localPart.replace(/\./g, '');
    for (const domain of PANDA_EMPLOYEE_EMAIL_DOMAINS) {
      addCandidate(`${localPart}@${domain}`);
      addCandidate(`${dotlessLocalPart}@${domain}`);
    }
  }

  return candidates;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonatedUser, setImpersonatedUserState] = useState(null);
  const [actualUser, setActualUser] = useState(null); // The real admin user
  const [accessiblePages, setAccessiblePages] = useState([]);

  // Fetch extended user data from database
  const fetchExtendedUserData = async (cognitoUser) => {
    try {
      let dbUser = null;

      // Look up user by email from Cognito with normalization fallbacks for Panda domains.
      if (cognitoUser.email) {
        const emailCandidates = buildEmailLookupCandidates(cognitoUser.email);
        for (const candidate of emailCandidates) {
          // eslint-disable-next-line no-await-in-loop
          dbUser = await usersApi.getUserByEmail(candidate).catch(() => null);
          if (dbUser) break;
        }

        if (dbUser) {
          // Get roleType from the role relation (set during migration)
          const roleType = dbUser.role?.roleType || getRoleType(dbUser.role?.name || cognitoUser.role);

          // directReports are included in the getUserByEmail response
          const teamMembers = dbUser.directReports || [];
          const firstName = dbUser.firstName || cognitoUser.firstName || '';
          const lastName = dbUser.lastName || cognitoUser.lastName || '';
          const fullName = dbUser.fullName || cognitoUser.name || `${firstName} ${lastName}`.trim() || null;

          return {
            ...cognitoUser,
            ...dbUser,
            firstName,
            lastName,
            fullName,
            name: fullName,
            roleType,
            teamMembers,
            isManager: teamMembers.length > 0,
            teamMemberIds: teamMembers.map(m => m.id),
            officeAssignment: dbUser.officeAssignment,
          };
        }

        console.warn('Could not find user in database by email candidates:', emailCandidates);
      }
    } catch (error) {
      console.error('Error fetching extended user data:', error);
    }
    // Return basic user with computed role type
    const fallbackName = cognitoUser.name || [cognitoUser.firstName, cognitoUser.lastName].filter(Boolean).join(' ') || null;
    return {
      ...cognitoUser,
      name: fallbackName,
      fullName: fallbackName,
      roleType: getRoleType(cognitoUser.role),
      teamMembers: [],
      isManager: false,
      teamMemberIds: [],
    };
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        try {
          const cognitoUser = await authApi.getCurrentUser(accessToken);
          const extendedUser = await fetchExtendedUserData(cognitoUser);
          setUser(extendedUser);
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
    localStorage.setItem('userEmail', email.toLowerCase()); // Store email for token refresh

    const cognitoUser = await authApi.getCurrentUser(response.accessToken);
    const extendedUser = await fetchExtendedUserData(cognitoUser);
    setUser(extendedUser);

    return { success: true };
  }, []);

  const completeNewPassword = useCallback(async (email, newPassword, session) => {
    const response = await authApi.completeNewPassword(email, newPassword, session);

    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    localStorage.setItem('idToken', response.idToken);
    localStorage.setItem('userEmail', email.toLowerCase()); // Store email for token refresh

    const cognitoUser = await authApi.getCurrentUser(response.accessToken);
    const extendedUser = await fetchExtendedUserData(cognitoUser);
    setUser(extendedUser);

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
    localStorage.removeItem('userEmail');
    setUser(null);
  }, []);

  const refreshToken = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem('refreshToken');
    const userEmail = localStorage.getItem('userEmail');
    if (!storedRefreshToken || !userEmail) {
      throw new Error('No refresh token or email');
    }

    const response = await authApi.refreshToken(storedRefreshToken, userEmail);
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('idToken', response.idToken);

    return response.accessToken;
  }, []);

  // Check if current (actual) user is admin
  const isActualUserAdmin = useCallback(() => {
    const userToCheck = actualUser || user;
    if (!userToCheck) return false;

    // Handle both string role and object role (from database)
    const roleName = typeof userToCheck.role === 'string'
      ? userToCheck.role.toLowerCase()
      : (userToCheck.role?.name?.toLowerCase() || '');
    const roleType = userToCheck.role?.roleType?.toLowerCase() || userToCheck.roleType?.toLowerCase() || '';

    // Check role name or roleType for admin permissions
    return roleName.includes('super_admin') || roleName.includes('admin') ||
           roleName === 'super admin' || roleName === 'admin' ||
           roleType === 'super_admin' || roleType === 'admin';
  }, [actualUser, user]);

  // Check if user has access to a specific management page
  const hasPageAccess = useCallback((pageId) => {
    // Admins have access to all pages
    if (isActualUserAdmin()) return true;

    // Check if page is in accessible pages list
    return accessiblePages.some(page => page.id === pageId);
  }, [accessiblePages, isActualUserAdmin]);

  // Fetch accessible pages when user changes
  useEffect(() => {
    const fetchAccessiblePages = async () => {
      if (!user) {
        setAccessiblePages([]);
        return;
      }

      try {
        const pages = await rolesApi.getAccessiblePages();
        setAccessiblePages(pages || []);
      } catch (error) {
        console.error('Error fetching accessible pages:', error);
        setAccessiblePages([]);
      }
    };

    fetchAccessiblePages();
  }, [user]);

  // Start impersonating another user (admin only)
  const startImpersonation = useCallback(async (targetUser) => {
    if (!isActualUserAdmin()) {
      throw new Error('Only admins can impersonate users');
    }

    // Store the actual admin user if not already stored
    if (!actualUser) {
      setActualUser(user);
    }

    // Fetch extended data for the target user
    let fullTargetUser = targetUser;
    if (targetUser.email && !targetUser.roleType) {
      try {
        const dbUser = await usersApi.getUserByEmail(targetUser.email);
        if (dbUser) {
          const roleType = dbUser.role?.roleType || getRoleType(dbUser.role?.name || targetUser.role);
          const teamMembers = dbUser.directReports || [];
          fullTargetUser = {
            ...targetUser,
            ...dbUser,
            roleType,
            teamMembers,
            isManager: teamMembers.length > 0,
            teamMemberIds: teamMembers.map(m => m.id),
            officeAssignment: dbUser.officeAssignment,
          };
        }
      } catch (err) {
        console.warn('Could not fetch extended user data for impersonation:', err);
      }
    }

    setImpersonatedUserState(fullTargetUser);
    setUser(fullTargetUser);

    // Store in session storage (survives page refresh within tab)
    sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(fullTargetUser));
  }, [actualUser, user, isActualUserAdmin]);

  // Stop impersonation and return to actual user
  const stopImpersonation = useCallback(() => {
    if (actualUser) {
      setUser(actualUser);
      setActualUser(null);
    }
    setImpersonatedUserState(null);
    sessionStorage.removeItem(IMPERSONATION_KEY);
  }, [actualUser]);

  // Check for stored impersonation on mount
  useEffect(() => {
    const storedImpersonation = sessionStorage.getItem(IMPERSONATION_KEY);
    if (storedImpersonation && user && !impersonatedUser) {
      try {
        const impersonated = JSON.parse(storedImpersonation);
        // Check if actual user is admin
        const roleName = user.role?.name?.toLowerCase() || '';
        const userIsAdmin = roleName.includes('admin') ||
                           user.roleType === 'ADMIN' || user.roleType === 'EXECUTIVE';
        if (userIsAdmin) {
          setActualUser(user);
          setImpersonatedUserState(impersonated);
          setUser(impersonated);
        } else {
          // Not admin, clear stale impersonation
          sessionStorage.removeItem(IMPERSONATION_KEY);
        }
      } catch (err) {
        sessionStorage.removeItem(IMPERSONATION_KEY);
      }
    }
  }, [user, impersonatedUser]);

  const value = {
    user,
    actualUser, // The real admin user when impersonating
    loading,
    login,
    logout,
    completeNewPassword,
    refreshToken,
    isAuthenticated: !!user,
    // Impersonation
    isImpersonating: !!impersonatedUser,
    impersonatedUser,
    startImpersonation,
    stopImpersonation,
    isActualUserAdmin,
    // Page access
    hasPageAccess,
    accessiblePages,
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
