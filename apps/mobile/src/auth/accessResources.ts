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
  if (!row || row.id !== uid || !row.org_id || !row.onboarded_at || row.role === 'guardian') {
    return { row, activeProfileDenied: false };
  }
  const client = getGiokonClient();
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
  return { row, activeProfileDenied };
}
