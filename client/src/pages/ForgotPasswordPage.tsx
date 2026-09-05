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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-blue-50 to-indigo-100">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🔑</div>
            <h1 className="text-2xl font-bold text-gray-900">{t('forgotPasswordTitle')}</h1>
            <p className="text-gray-500 text-sm mt-1">{t('forgotPasswordSubtitle')}</p>
          </div>

          {submitted ? (
            <div className="text-center">
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
                <p className="text-green-800 font-medium">{t('checkInbox')}</p>
                <p className="text-green-700 text-sm mt-1">
                  <strong>{email}</strong>: {t('resetIfRegistered')}
                </p>
              </div>
              <Link
                to="/login"
                className="text-green-600 hover:text-green-700 text-sm font-medium"
              >
                {t('backToSignIn')}
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('emailAddress')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent outline-none transition"
                    placeholder={t('emailPlaceholder')}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg transition shadow-md"
                >
                  {loading ? t('sending') : t('sendResetLink')}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-5">
                {t('rememberIt')}{' '}
                <Link to="/login" className="text-green-600 hover:text-green-700 font-medium">
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
