import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Trophy,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { useAuth } from '../auth/AuthContext';

const adminLinks = [
  { to: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { to: '/scores', label: 'إدخال الدرجات', icon: ClipboardList },
  { to: '/rankings', label: 'الترتيب', icon: Trophy },
];

const userLinks = [
  { to: '/scores', label: 'إدخال الدرجات', icon: ClipboardList },
];

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user?.role === 'ADMIN' ? adminLinks : userLinks;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-[1500px] items-center justify-between px-4 sm:px-6 md:min-h-24">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="شعار النظام"
              className="h-16 w-auto shrink-0 bg-primary color-primary object-contain object-center md:h-20 hidden"//I added hidden to hide the logo on small screens
            />
            <div>
              <div className="font-bold text-primary">متتبع الدرجات</div>
              <div className="text-xs text-slate-500">
                {user?.committee?.name ?? 'الإدارة'}
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-primary'
                  }`
                }
                style={{ borderRadius: 6 }}
              >
                <Icon size={17} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden text-left sm:block">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-slate-500">{user?.email}</div>
            </div>
            <button
              className="icon-button hidden md:inline-flex"
              onClick={handleLogout}
              title="تسجيل الخروج"
            >
              <LogOut size={18} />
            </button>
            <button
              className="icon-button md:hidden"
              onClick={() => setMenuOpen((value) => !value)}
              title="القائمة"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-slate-100 bg-white p-3 md:hidden">
            <div className="mx-auto grid max-w-[1500px] gap-1">
              {links.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-3 text-sm font-semibold ${
                      isActive
                        ? 'bg-primary text-white'
                        : 'text-slate-700'
                    }`
                  }
                  style={{ borderRadius: 6 }}
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-red-700"
              >
                <LogOut size={18} />
                تسجيل الخروج
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
