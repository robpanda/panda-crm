import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { metabaseApi } from '../../services/api';
import { RefreshCw, AlertTriangle } from 'lucide-react';

const EMBED_SCRIPT_ID = 'metabase-embed-script';

function useMetabaseScript(metabaseUrl) {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!metabaseUrl) return;
    if (document.getElementById(EMBED_SCRIPT_ID)) {
      setStatus('loaded');
      return;
    }

    const script = document.createElement('script');
    script.id = EMBED_SCRIPT_ID;
    script.async = true;
    script.src = `${metabaseUrl}/app/embed.js`;
    script.onload = () => setStatus('loaded');
    script.onerror = () => setStatus('failed');
    document.body.appendChild(script);

    return () => {
      // leave script in place for reuse
    };
  }, [metabaseUrl]);

  return status;
}

export default function MetabaseWidget({
  type,
  id,
  mode = 'static',
  height = 420,
  filters = {},
  params = {},
  lockedParams = {},
  className = '',
  refreshKey = null,
  expiresIn = 600,
}) {
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['metabase-settings'],
    queryFn: () => metabaseApi.getSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const metabaseUrl = settings?.data?.url || settings?.data?.metabaseUrl || null;
  const scriptStatus = useMetabaseScript(metabaseUrl);
  const mergedParams = useMemo(() => ({ ...params, ...filters }), [params, filters]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '100px' }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !type || !id) return;
    let active = true;

    const fetchToken = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await metabaseApi.getGuestToken({
          type,
          id,
          params: mergedParams,
          lockedParams,
          expiresIn,
        });
        const nextToken = response?.data?.token || response?.token || response?.data?.data?.token;
        if (!nextToken) {
          throw new Error('No token returned');
        }
        if (active) {
          setToken(nextToken);
        }
      } catch (err) {
        if (active) {
          setError(err?.response?.data?.error?.message || err?.message || 'Failed to load widget');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchToken();

    return () => {
      active = false;
    };
  }, [isVisible, type, id, mergedParams, lockedParams, expiresIn, refreshKey]);

  const embedUrl = token && metabaseUrl ? `${metabaseUrl}/embed/${type}/${token}#bordered=true&titled=true` : null;
  const ComponentTag = type === 'question' ? 'metabase-question' : 'metabase-dashboard';
  const useIframeFallback = scriptStatus === 'failed';

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-800/70">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading widget...
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 text-red-700 rounded-lg">
          <AlertTriangle className="w-5 h-5 mb-2" />
          <div className="text-sm">{error}</div>
        </div>
      )}
      {!error && embedUrl && (
        useIframeFallback ? (
          <iframe title={`metabase-${type}-${id}`} src={embedUrl} className="w-full h-full border-0 rounded-lg" allowFullScreen />
        ) : (
          <ComponentTag src={embedUrl} data-mode={mode} style={{ width: '100%', height: '100%', display: 'block' }} />
        )
      )}
    </div>
  );
}
