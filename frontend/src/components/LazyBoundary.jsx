import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

function LazyBoundaryFallback({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-gray-500">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      <span>{label}</span>
    </div>
  );
}

export function LazyBoundary({ children, label }) {
  return (
    <Suspense fallback={<LazyBoundaryFallback label={label} />}>
      {children}
    </Suspense>
  );
}

export default LazyBoundary;
