import { lazy } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { List, Plus } from 'lucide-react';
import LazyBoundary from './LazyBoundary';

const CreateTicketModal = lazy(() => import('./CreateTicketModal'));

export default function NavbarSupportSurface({
  currentPath,
  showMenu,
  showCreateTicketModal,
  onCloseMenu,
  onOpenCreateTicket,
  onCloseCreateTicket,
}) {
  const navigate = useNavigate();

  const handleSubmit = async (ticketData) => {
    const response = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/support/tickets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: ticketData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create ticket' }));
      throw new Error(error.error || 'Failed to create ticket');
    }

    onCloseCreateTicket();
    navigate('/support');
  };

  return (
    <>
      {showMenu && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <NavLink
            to="/support"
            onClick={onCloseMenu}
            className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
              currentPath === '/support' ? 'bg-panda-primary/10 text-panda-primary' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <List className="w-4 h-4" />
            <span>My Tickets</span>
          </NavLink>
          <button
            onClick={() => {
              onCloseMenu();
              onOpenCreateTicket();
            }}
            className="flex items-center space-x-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 w-full"
          >
            <Plus className="w-4 h-4" />
            <span>New Ticket</span>
          </button>
        </div>
      )}

      {showCreateTicketModal && (
        <LazyBoundary label="Loading ticket form...">
          <CreateTicketModal onClose={onCloseCreateTicket} onSubmit={handleSubmit} />
        </LazyBoundary>
      )}
    </>
  );
}
