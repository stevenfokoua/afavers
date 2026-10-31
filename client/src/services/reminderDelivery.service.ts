import { supabase } from '../lib/supabase';
import { getPrivateDataOwner } from '../store/privateStorage';
export interface ReminderDelivery { item_id: string; state: 'scheduled' | 'not_scheduled' | 'missed' | 'claimed' | 'retry' | 'sent' | 'failed' | 'uncertain' | 'cancelled'; due_at: string | null; sent_at: string | null; error_code: string | null; attempts: number }
export async function getReminderDeliveries(): Promise<ReminderDelivery[]> {
  const owner = getPrivateDataOwner(); if (owner === null) return [];
  const { data, error } = await supabase.rpc('get_reminder_delivery_status', { p_user_id: owner });
  if (getPrivateDataOwner() !== owner) return [];
  if (error) throw new Error('Reminder delivery status is unavailable');
  return data ?? [];
}
