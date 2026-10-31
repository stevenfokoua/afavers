import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../store/languageStore';
import { LanguageToggle } from '../components/common/LanguageToggle';

export const ForgotPasswordPage = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas   ">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="max-w-md w-full mx-4">
        <div className="bg-surface rounded-lg shadow-none p-8">
          <div className="text-center mb-8">
            
            <h1 className="text-2xl font-semibold text-ink">{t('forgotPasswordTitle')}</h1>
            <p className="text-muted text-sm mt-1">{t('forgotPasswordSubtitle')}</p>
          </div>

          {submitted ? (
            <div className="text-center">
              <div className="bg-subtle border border-line rounded-lg p-5 mb-6">
                <p className="text-accent font-medium">{t('checkInbox')}</p>
                <p className="text-accent text-sm mt-1">
                  <strong>{email}</strong>: {t('resetIfRegistered')}
                </p>
              </div>
              <Link
                to="/login"
                className="text-accent hover:text-accent text-sm font-medium"
              >
                {t('backToSignIn')}
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 bg-danger-soft border border-line text-danger px-4 py-3 rounded-lg">
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
                    {t('emailAddress')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent outline-none transition"
                    placeholder={t('emailPlaceholder')}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-ink   hover: hover: disabled:opacity-50 text-on-ink font-semibold py-3 px-4 rounded-lg transition shadow-none"
                >
                  {loading ? t('sending') : t('sendResetLink')}
                </button>
              </form>

              <p className="text-center text-sm text-muted mt-5">
                {t('rememberIt')}{' '}
                <Link to="/login" className="text-accent hover:text-accent font-medium">
                  {t('signIn')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
