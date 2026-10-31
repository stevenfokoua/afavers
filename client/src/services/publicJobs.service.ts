import { supabase } from '../lib/supabase';
import { discoveryJobs } from '../../../supabase/functions/_shared/job-quality';

export interface PublicJob {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  salary: string | null;
  source: string;
  posted_date: string | null;
  deadline?: string | null;
  is_active?: boolean;
  updated_at?: string;
  color?: string;
}

export async function getPublicJobs(limit = 10): Promise<PublicJob[]> {
  const take = Math.max(1, Math.min(100, Math.floor(limit)));
  const window = Math.min(300, take * 3);
  let { data, error } = await supabase
    .from('public_jobs')
    .select('id,title,company,location,url,salary,source,posted_date,deadline,is_active,updated_at')
    .order('created_at', { ascending: false })
    .limit(window);

  if (error && /public_jobs/i.test(error.message)) {
    const fallback = await supabase
      .from('jobs')
      .select('id,title,company,location,url,salary,source,posted_date,deadline,is_active,updated_at')
      .is('owner_user_id', null)
      .eq('is_manual', false)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .not('url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(window);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);
  return discoveryJobs((data ?? []) as PublicJob[]).slice(0, take);
}
