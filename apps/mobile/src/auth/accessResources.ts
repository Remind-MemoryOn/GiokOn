import { getCurrentUserRow, getGiokonClient, canProcessSession } from '@giokon/data';
import { queryScope } from '../lib/supabase';
import { useApp } from '../store/appStore';
import { closeLiveEngine } from '../lib/live/engine';
import type { AccessSnapshot } from './accessMonitor';

export function resetAccessResources(): void {
  // Close transport synchronously before waiting for native audio cleanup.
  void closeLiveEngine().catch(() => {});
  useApp.setState({ active: null, lastFinished: null });
  queryScope.reset();
}

export async function loadAccessSnapshot(uid: string): Promise<AccessSnapshot> {
  const row = await getCurrentUserRow();
  const assignments: string[] = [];
  if (!row || row.id !== uid || !row.org_id || !row.onboarded_at || row.role === 'guardian') {
    return { row, assignments, activeProfileDenied: false };
  }
  const client = getGiokonClient();
  // Page the IDs; PostgREST's row limit must not look like assignment removal.
  if (row.role === 'caregiver') {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('profile_caregivers').select('profile_id')
        .eq('caregiver_user_id', uid).eq('status', 'active').order('profile_id')
        .range(offset, offset + 499);
      if (error) throw error;
      assignments.push(...(data ?? []).map(item => item.profile_id));
      if (!data || data.length < 500) break;
    }
  }
  const active = useApp.getState().active;
  let activeProfileDenied = false;
  if (active) {
    const { data, error } = await client.from('profiles').select('id')
      .eq('id', active.elder.id).maybeSingle();
    if (error) throw error;
    activeProfileDenied = !data && useApp.getState().active === active;
    if (data && active.remoteId) {
      const allowed = await canProcessSession(active.remoteId);
      activeProfileDenied = !allowed && useApp.getState().active === active;
    }
  }
  return { row, assignments, activeProfileDenied };
}
