import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LazyBoundary from '../components/LazyBoundary';

export function renderLazyRoute(Component, label) {
  return (
    <LazyBoundary label={label}>
      <Component />
    </LazyBoundary>
  );
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function RedirectWithId({ basePath, suffix = '' }) {
  const { id } = useParams();

  if (!id) {
    return <Navigate to={basePath} replace />;
  }

  return <Navigate to={`${basePath}/${id}${suffix}`} replace />;
}
