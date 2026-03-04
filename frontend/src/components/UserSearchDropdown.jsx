import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search } from 'lucide-react';
import { usersApi } from '../services/api';

export default function UserSearchDropdown({
  value = '',
  onChange,
  placeholder = 'Search users...',
  showClear = false,
}) {
  const [query, setQuery] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const { data: usersData } = useQuery({
    queryKey: ['user-search-dropdown', query],
    queryFn: () => usersApi.getUsers({ search: query, limit: 20, isActive: true }),
    enabled: query.length >= 2,
    staleTime: 30000,
  });

  const users = useMemo(() => {
    if (Array.isArray(usersData)) return usersData;
    if (Array.isArray(usersData?.data)) return usersData.data;
    return [];
  }, [usersData]);

  const handleSelect = (user) => {
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    setQuery(name);
    setIsOpen(false);
    onChange?.(name, user);
  };

  const handleInputChange = (e) => {
    const next = e.target.value;
    setQuery(next);
    setIsOpen(true);
    onChange?.(next, null);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    onChange?.('', null);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 bg-white">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full text-sm text-gray-900 focus:outline-none"
        />
        {showClear && query && (
          <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          {users.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">No users found</div>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelect(user)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              >
                {(user.firstName || '')} {(user.lastName || '')}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
