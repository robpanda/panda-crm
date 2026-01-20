import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import MobileNav from './MobileNav';
import MobileSidebar from './MobileSidebar';
import TrainingBot from './TrainingBot';
import OnboardingTour from './OnboardingTour';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top Navigation */}
      <Navbar onMenuClick={() => setSidebarOpen(true)} showMenuButton={isMobile} />

      {/* Mobile Sidebar Drawer */}
      <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content - Full width now, with safe area inset for iPhone notch/Dynamic Island */}
      <main className={`min-h-[calc(100vh-4rem)] p-4 sm:p-6 ${isMobile ? 'pb-20' : ''}`} style={{ marginTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        <div className="max-w-[1920px] mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileNav onMoreClick={() => setSidebarOpen(true)} />}

      {/* Training Bot Widget */}
      <TrainingBot />

      {/* First-time User Onboarding Tour */}
      <OnboardingTour />
    </div>
  );
}
