import { LockKeyhole, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { StatusMessage } from '../components/StatusMessage';
import { getErrorMessage } from '../utils/errors';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate(user.role === 'ADMIN' ? '/dashboard' : '/scores', {
        replace: true,
      });
    }
  }, [user, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const currentUser = await login(email, password);
      navigate(currentUser.role === 'ADMIN' ? '/dashboard' : '/scores', {
        replace: true,
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.7fr)]">
      <section className="hidden bg-primary p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="grid size-14 place-items-center border border-white/20 bg-white/10 text-2xl font-bold text-secondary">
          م
        </div>
        <div className="max-w-xl">
          <div className="mb-5 h-1 w-16 bg-secondary" />
          <h1 className="text-4xl font-bold leading-relaxed">
            إدارة دقيقة وواضحة لدرجات المنافسات
          </h1>
          <p className="mt-4 text-base leading-8 text-white/70">
            منصة موحدة للجان والأسر والترتيب النهائي.
          </p>
        </div>
        <div className="text-sm text-white/50">Marks Tracker</div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md border border-slate-200 bg-white p-6 shadow-panel sm:p-9"
          style={{ borderRadius: 8 }}
        >
          <div className="mb-8">
            <div className="mb-5 grid size-12 place-items-center bg-primary text-xl font-bold text-secondary lg:hidden">
              م
            </div>
            <h2 className="text-2xl font-bold text-primary">تسجيل الدخول</h2>
            <p className="mt-2 text-sm text-slate-500">
              أدخل بيانات حسابك للمتابعة
            </p>
          </div>

          {error && <StatusMessage message={error} />}

          <label className="mb-5 block">
            <span className="mb-2 block text-sm font-semibold">
              البريد الإلكتروني
            </span>
            <div className="relative">
              <Mail
                size={18}
                className="pointer-events-none absolute right-3 top-3 text-slate-400"
              />
              <input
                className="field pr-10"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                dir="ltr"
              />
            </div>
          </label>

          <label className="mb-7 block">
            <span className="mb-2 block text-sm font-semibold">كلمة المرور</span>
            <div className="relative">
              <LockKeyhole
                size={18}
                className="pointer-events-none absolute right-3 top-3 text-slate-400"
              />
              <input
                className="field pr-10"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                dir="ltr"
              />
            </div>
          </label>

          <button className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'جارٍ تسجيل الدخول...' : 'دخول'}
          </button>
        </form>
      </section>
    </div>
  );
}
