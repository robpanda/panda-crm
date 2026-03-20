import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeOff } from 'lucide-react';
import { usersApi } from '../services/api';

export default function NavbarViewAsMenu({
  user,
  actualUser,
  isImpersonating,
  startImpersonation,
  stopImpersonation,
  onClose,
}) {
  const [viewAsSearch, setViewAsSearch] = useState('');
  const [viewAsUsers, setViewAsUsers] = useState([]);
  const [viewAsLoading, setViewAsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    setViewAsLoading(true);
    usersApi
      .getUsersForDropdown({ limit: 100 })
      .then((response) => {
        if (!isMounted) return;
        const users = response?.data || response || [];
        setViewAsUsers(Array.isArray(users) ? users : []);
      })
      .catch((err) => {
        console.error('Failed to load users for View As:', err);
      })
      .finally(() => {
        if (isMounted) {
          setViewAsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredViewAsUsers = useMemo(() => {
    if (!viewAsSearch) return viewAsUsers;

    const search = viewAsSearch.toLowerCase();

    return viewAsUsers.filter((targetUser) => {
      const name = `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.toLowerCase();
      const email = (targetUser.email || '').toLowerCase();
      return name.includes(search) || email.includes(search);
    });
  }, [viewAsSearch, viewAsUsers]);

  const handleViewAsUser = async (targetUser) => {
    try {
      await startImpersonation(targetUser);
      setViewAsSearch('');
      onClose();
      navigate('/');
    } catch (err) {
      console.error('Failed to impersonate user:', err);
    }
  };

  const handleStopImpersonation = () => {
    stopImpersonation();
    setViewAsSearch('');
    onClose();
  };

  return (
    <div className="absolute right-0 mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
      <div className="px-3 pb-2 border-b border-gray-100">
        <input
          type="text"
          autoFocus
          placeholder="Search users..."
          value={viewAsSearch}
          onChange={(e) => setViewAsSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
        />
      </div>

      {isImpersonating && (
        <button
          onClick={handleStopImpersonation}
          className="flex items-center w-full px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 border-b border-gray-100"
        >
          <EyeOff className="w-4 h-4 mr-3" />
          <span>Stop Viewing As</span>
          <span className="ml-auto text-xs text-gray-500">Back to {actualUser?.firstName || 'you'}</span>
        </button>
      )}

      <div className="max-h-64 overflow-y-auto">
        {viewAsLoading ? (
          <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading users...</div>
        ) : filteredViewAsUsers.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-500 text-center">
            {viewAsSearch ? 'No users found' : 'No users available'}
          </div>
        ) : (
          filteredViewAsUsers.slice(0, 20).map((targetUser) => (
            <button
              key={targetUser.id}
              onClick={() => handleViewAsUser(targetUser)}
              className={`flex items-center w-full px-4 py-2 text-sm hover:bg-gray-100 ${
                user?.id === targetUser.id ? 'bg-panda-primary/5' : ''
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center mr-3 flex-shrink-0">
                <span className="text-white text-xs font-medium">
                  {(targetUser.firstName || targetUser.email || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-medium text-gray-900 truncate">
                  {targetUser.firstName && targetUser.lastName
                    ? `${targetUser.firstName} ${targetUser.lastName}`
                    : targetUser.email}
                </p>
                <p className="text-xs text-gray-500 truncate">{targetUser.role?.name || targetUser.department || ''}</p>
              </div>
              {user?.id === targetUser.id && (
                <span className="ml-2 text-xs bg-panda-primary/10 text-panda-primary px-2 py-0.5 rounded">Current</span>
              )}
            </button>
          ))
        )}
        {filteredViewAsUsers.length > 20 && (
          <div className="px-4 py-2 text-xs text-gray-500 text-center border-t border-gray-100">
            Showing first 20 results. Type to search more.
          </div>
        )}
      </div>
    </div>
  );
}
