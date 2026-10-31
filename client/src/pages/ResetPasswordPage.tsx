import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../store/languageStore';
import { LanguageToggle } from '../components/common/LanguageToggle';

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('passwordsDontMatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetExpired'));
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
            
            <h1 className="text-2xl font-semibold text-ink">{t('setNewPassword')}</h1>
            <p className="text-muted text-sm mt-1">{t('resetPasswordSubtitle')}</p>
          </div>

          {success ? (
            <div className="text-center">
              <div className="bg-subtle border border-line rounded-lg p-5 mb-4">
                <p className="text-accent font-medium">{t('passwordUpdated')}</p>
                <p className="text-accent text-sm mt-1">{t('redirectingSignIn')}</p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 bg-danger-soft border border-line text-danger px-4 py-3 rounded-lg">
                  <p className="text-sm">{error}</p>
                  {error.includes('expired') && (
                    <Link to="/forgot-password" className="text-danger hover:underline text-xs mt-1 block">
                      {t('requestNewReset')}
                    </Link>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">{t('newPassword')}</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent outline-none transition"
                    placeholder={t('minCharsHint')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">{t('confirmPassword')}</label>
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="w-full px-4 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent outline-none transition"
                    placeholder={t('repeatNewPassword')}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-ink   hover: hover: disabled:opacity-50 text-on-ink font-semibold py-3 px-4 rounded-lg transition shadow-none"
                >
                  {loading ? t('updating') : t('updatePassword')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
