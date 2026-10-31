import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { invalidateJobSnapshot } from './jobSnapshot';

export interface Settings {
  keywords: string;
  locations: string;
}

const DEFAULT_SETTINGS: Settings = {
  keywords: 'developer,analyst,engineer',
  locations: 'Berlin,München,Hamburg',
};

function getUserId(): number {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('You need to sign in again.');
  return userId;
}

export const settingsService = {
  async get(): Promise<Settings> {
    const userId = getUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .select('keywords,locations')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ?? DEFAULT_SETTINGS;
  },

  async save(settings: Settings): Promise<void> {
    const userId = getUserId();
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        keywords: settings.keywords,
        locations: settings.locations,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);
    invalidateJobSnapshot();
  },
};
