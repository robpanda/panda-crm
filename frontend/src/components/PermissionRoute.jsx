import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * PermissionRoute - Wrapper component that checks page access before rendering
 *
 * Usage:
 *   <PermissionRoute page="cases">
 *     <CasesPage />
 *   </PermissionRoute>
 *
 * If user doesn't have access, redirects to dashboard
 */
export function PermissionRoute({ page, children, redirectTo = '/dashboard' }) {
  const { hasPageAccess, loading, isAuthenticated } = useAuth();

  // Wait for auth to be ready
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Must be authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check page access
  if (!hasPageAccess(page)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

export default PermissionRoute;
