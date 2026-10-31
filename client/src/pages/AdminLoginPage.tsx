import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { friendlyErrorMessage } from '../utils/errorMessage';

export const AdminLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      const user = useAuthStore.getState().user;
      if (!user?.isAdmin) {
        setError('Invalid admin credentials.');
        useAuthStore.getState().logout();
        return;
      }
      navigate('/admin');
    } catch (err) {
      setError(friendlyErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-red-900/40 border border-line mb-4">
            <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-ink">Admin Access</h1>
          <p className="text-sm text-muted mt-1">Admin accounts only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            aria-label="Admin email" type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="off"
            className="w-full px-4 py-3 bg-surface border border-line rounded-lg text-ink placeholder-gray-500 text-sm focus:outline-none focus-visible:border-line focus-visible:ring-1 focus-visible:ring-red-600"
          />
          <input
            aria-label="Admin password" type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="off"
            className="w-full px-4 py-3 bg-surface border border-line rounded-lg text-ink placeholder-gray-500 text-sm focus:outline-none focus-visible:border-line focus-visible:ring-1 focus-visible:ring-red-600"
          />
          {error && <p className="text-danger text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 bg-ink hover:bg-ink disabled:opacity-40 text-on-ink font-semibold rounded-lg text-sm transition"
          >
            {loading ? 'Verifying…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
};
