import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../store/languageStore';
import { friendlyErrorMessage } from '../utils/errorMessage';
import { LanguageToggle } from '../components/common/LanguageToggle';
export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore(state => state.login);
  const loginDemo = useAuthStore(state => state.loginDemo);
  const navigate = useNavigate();
  const {
    t
  } = useLanguage();
  const handleDemo = async () => {
    setError('');
    setDemoLoading(true);
    try {
      await loginDemo();
      navigate('/dashboard');
    } catch {
      setError(t('demoUnavailable'));
    } finally {
      setDemoLoading(false);
    }
  };
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(friendlyErrorMessage(err, t('invalidCredentials')));
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen flex bg-canvas ">
      <div className="absolute right-4 top-4 z-20">
        <LanguageToggle />
      </div>

      {/* Left panel — branding (hidden on mobile) */}
      <div className="auth-aside hidden lg:flex lg:w-1/2 bg-subtle   flex-col justify-between p-12 relative overflow-hidden">
        {/* Background decoration */}
        
        

        <div className="relative z-10">
          <img src="/logo.png" alt="afavers" className="h-20 w-20 rounded-lg shadow-none" onError={e => {
          (e.target as HTMLImageElement).style.display = 'none';
        }} />
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-semibold text-on-ink leading-tight mb-4">
              Your personal<br />job tracker
            </h1>
            <p className="text-accent text-lg leading-relaxed">
              Save jobs, track applications, and manage your pipeline — all in one place.
            </p>
          </div>

          <div className="space-y-4">
            {[{
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>,
            text: 'Discover and save jobs from multiple sources'
          }, {
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>,
            text: 'Kanban board to manage your pipeline'
          }, {
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>,
            text: 'Interactive map of jobs across Germany'
          }].map(({
            icon,
            text
          }) => <div key={text} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-surface/15 flex items-center justify-center text-on-ink flex-shrink-0">
                  {icon}
                </div>
                <span className="text-accent text-sm">{text}</span>
              </div>)}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-accent text-xs">Free forever · No credit card needed</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img src="/logo.png" alt="afavers" className="h-20 w-20 mx-auto mb-3 rounded-lg shadow-none" onError={e => {
            (e.target as HTMLImageElement).style.display = 'none';
          }} />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-ink">{t('welcomeBack')}</h2>
            <p className="text-muted text-sm mt-1">{t('signInSubtitle')}</p>
          </div>

          {error && <div className="mb-5 flex items-start gap-3 bg-danger-soft border border-line text-danger px-4 py-3 rounded-lg">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">{error}</p>
            </div>}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">{t('email')}</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                  <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent outline-none transition bg-canvas focus:bg-surface text-sm" placeholder="you@example.com" />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-ink">{t('password')}</label>
                <Link to="/forgot-password" className="text-xs text-accent hover:text-accent font-medium">
                  {t('forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input id="password" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-11 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent outline-none transition bg-canvas focus:bg-surface text-sm" placeholder="••••••••" />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-muted transition">
                  {showPassword ? <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg> : <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 bg-ink hover:bg-ink disabled:opacity-50 text-on-ink font-semibold py-3 px-4 rounded-lg transition shadow-none hover:shadow-none text-sm">
              {loading ? <>
                  <svg className=" h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('signingIn')}
                </> : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  {t('signIn')}
                </>}
            </button>
          </form>

          <div className="mt-5">
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-line" />
              <span className="px-3 text-xs text-muted font-medium">{t('or')}</span>
              <div className="flex-grow border-t border-line" />
            </div>
            <button onClick={handleDemo} disabled={demoLoading} className="mt-4 w-full flex items-center justify-center gap-2 bg-subtle hover:bg-subtle border border-line disabled:opacity-50 text-muted font-semibold py-3 px-4 rounded-lg transition text-sm">
              {demoLoading ? <>
                  <svg className=" h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('loadingDemo')}
                </> : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('tryDemo')}
                </>}
            </button>
          </div>

          <p className="text-center text-sm text-muted mt-6">
            {t('noAccount')}{' '}
            <Link to="/register" className="text-accent hover:text-accent font-semibold">
              {t('createOneFree')}
            </Link>
          </p>

          <p className="text-center text-xs text-muted mt-8">
            {t('loginFooter')}
          </p>
        </div>
      </div>
    </div>;
};
