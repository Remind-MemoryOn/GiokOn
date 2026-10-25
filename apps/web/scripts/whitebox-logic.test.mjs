// Structural tests: branches, boundary loops and auth-generation data flow.
// Run with the external-tool white-box runner; no production HTTP or dotenv.
import { routeAfterLogin, routeForUser, loginPath } from '../src/auth/routes.ts';
import { currentConsentOf, elderConsentGrant, consentSaveError } from '../src/lib/consents.ts';
import { CONSENT_VERSION } from '@giokon/core';
import { safetyEvidenceText, EVIDENCE_PENDING_TEXT, EVIDENCE_MISSING_TEXT } from '../src/lib/safetyEvidence.ts';
import { journalSummary, journalTitle, hhmm } from '../src/lib/programJournal.ts';
import { serverErrorMessage } from '../src/lib/serverErrors.ts';
import { journalErrorMessage } from '../src/lib/journalErrors.ts';
import { orgJoinErrorMessage } from '../src/lib/orgJoinErrors.ts';
import { durationLabel } from '../src/lib/session-row.ts';
import { dayKey, secondsParts } from '../src/lib/format.ts';
import { isFluidPath } from '../src/lib/viewportMode.ts';
import { Y } from '../src/lib/figmaY.ts';
import { useStore } from '../src/store/store.ts';
import { uploadJournalPhoto, removeJournalPhotoFiles, useJournalPhotoUrls } from '../src/lib/journalPhotos.ts';
import { uploadElderPhoto, useElderPhotoUrls } from '../src/lib/elderPhotos.ts';
import { getGiokonClient } from '@giokon/data';
import { useQuery } from '@tanstack/react-query';

vi.mock('@giokon/data', async importOriginal => ({ ...await importOriginal(), getGiokonClient: vi.fn() }));
vi.mock('@tanstack/react-query', async importOriginal => ({ ...await importOriginal(), useQuery: vi.fn(options => options) }));

const staff = { id: 'synthetic', role: 'caregiver', org_id: 'synthetic-org', onboarded_at: '2026-10-25' };
const guardian = { ...staff, role: 'guardian' };

describe('auth control-flow and normalized return allowlist', () => {
  test.each([
    [null, '/onboarding'], [{ ...staff, onboarded_at: null }, '/onboarding'],
    [guardian, '/guardian'], [{ ...staff, org_id: null }, '/join-pending'], [staff, '/caregiver'],
    ...['org_admin', 'center_director', 'social_worker'].map(role => [{ ...staff, role }, '/caregiver']),
  ])('role home %#', (row, expected) => expect(routeForUser(row)).toBe(expected));
  test.each([
    undefined, null, 0, {}, '', 'caregiver', 'https://outside.invalid', '//outside.invalid',
    '/\\outside.invalid', '/caregiver\u0000', '/caregiver\n', '/caregiver\u007f',
  ])('reject invalid path %#', value => {
    expect(loginPath(value)).toBe('/login');
    expect(routeAfterLogin(staff, value)).toBe('/caregiver');
  });
  test.each([
    ['/caregiver', '/caregiver'], ['/caregiver/supervision?q=a#e', '/caregiver/supervision?q=a#e'],
    ['/inquiries', '/inquiries'], ['/inquiries/new', '/inquiries/new'],
    ['/caregiver/../login', '/caregiver'], ['/caregiver/../guardian', '/caregiver'],
    ['/caregiverevil/secret', '/caregiver'], ['/inquiriesevil', '/caregiver'],
    ['/guardian/feed', '/caregiver'], ['/login?returnTo=/caregiver', '/caregiver'],
    ['/caregiver/./supervision', '/caregiver/supervision'],
  ])('normalized return %s', (input, expected) => expect(routeAfterLogin(staff, input)).toBe(expected));
  test('onboarding and org approval take precedence over a valid target', () => {
    expect(routeAfterLogin(null, '/inquiries/new')).toBe('/onboarding');
    expect(routeAfterLogin({ ...staff, org_id: null }, '/inquiries/new')).toBe('/join-pending');
    expect(routeAfterLogin(guardian, '/guardian/feed')).toBe('/guardian/feed');
    expect(routeAfterLogin(guardian, '/caregiver')).toBe('/guardian');
    expect(loginPath('/caregiver?q=a#b')).toBe('/login?returnTo=%2Fcaregiver%3Fq%3Da%23b');
  });
});

describe('consent filtering loop and evidence boundary', () => {
  const granted = { consent_type: 'ai_processing', granted: true, version: CONSENT_VERSION, revoked_at: null,
    granted_at: '2026-01-01T00:00:00Z', subject_type: 'self', capacity: 'capable', guardian_name: null, guardian_relation: null, basis: null };
  test('empty, stale, wrong-kind and revoked rows never substitute current consent', () => {
    expect(currentConsentOf(undefined, 'ai_processing')).toBeUndefined();
    expect(currentConsentOf([], 'ai_processing')).toBeUndefined();
    const candidates = [
      { ...granted, consent_type: 'privacy_required' }, { ...granted, granted: false },
      { ...granted, version: 'old-version' }, { ...granted, revoked_at: '2026-10-25' }, granted,
    ];
    expect(currentConsentOf(candidates.slice(0, -1), 'ai_processing')).toBeUndefined();
    expect(currentConsentOf(candidates, 'ai_processing')).toBe(granted);
  });
  test.each(['self', 'guardian', 'legal_representative'])('consent subject %s preserves data contract', subject => {
    const value = elderConsentGrant({ profileId: 'p', userId: 'u', orgId: null, type: 'ai_processing', subject, proxyName: '  합성대리  ', proxyRelation: '  자녀  ' });
    expect(value.version).toBe(CONSENT_VERSION);
    expect(value.granted).toBe(true);
    expect(value.profile_id).toBe('p');
    expect(value.guardian_name).toBe(subject === 'self' ? null : '합성대리');
    expect(value.guardian_relation).toBe(subject === 'self' ? null : '자녀');
  });
  test('migration message requires both enum and consent-kind markers', () => {
    expect(consentSaveError('consent_type elder_privacy_required')).not.toBe('consent_type elder_privacy_required');
    expect(consentSaveError('consent_type only')).toBe('consent_type only');
    expect(consentSaveError('elder_privacy_required only')).toBe('elder_privacy_required only');
  });
  test('present/pending/missing exactly at two-minute threshold', () => {
    const ev = { excerpt: null, created_at: '2026-10-25T00:00:00Z' };
    const start = Date.parse(ev.created_at);
    expect(safetyEvidenceText({ ...ev, excerpt: '  합성발화  ' }, start)).toBe('발화: “합성발화”');
    expect(safetyEvidenceText(ev, start + 119999)).toBe(EVIDENCE_PENDING_TEXT);
    expect(safetyEvidenceText(ev, start + 120000)).toBe(EVIDENCE_MISSING_TEXT);
    expect(safetyEvidenceText({ ...ev, created_at: 'invalid' }, start)).toBe(EVIDENCE_MISSING_TEXT);
  });
});

describe('journal display decisions never manufacture observed content', () => {
  test.each([
    [{ status: 'generating' }, '대화 기록으로 일지 초안을 만들고 있어요.'],
    [{ status: 'failed', last_error: '합성오류' }, '합성오류'],
    [{ status: 'failed', last_error: null }, '일지 초안을 만들지 못했어요. 다시 생성하거나 직접 입력해 주세요.'],
    [{ status: 'pending_review', delivered: false, non_delivery_reason: 'refused' }, '미제공 · 거부'],
    [{ status: 'pending_review', delivered: false, non_delivery_reason: null }, '미제공 · 사유 없음'],
    [{ status: 'final', delivered: true, activity_content: '기록', last_error: null }, '기록'],
    [{ status: 'pending_review', delivered: true, activity_content: null, last_error: '생성 생략' }, '생성 생략'],
    [{ status: 'pending_review', delivered: true, activity_content: null, last_error: null }, '아직 적은 내용이 없어요.'],
  ])('summary branch %#', (row, expected) => expect(journalSummary(row)).toBe(expected));
  test('missing time/date is a missing state', () => {
    expect(hhmm(null)).toBe('—'); expect(hhmm(undefined)).toBe('—'); expect(hhmm('09:03:00')).toBe('09:03');
    expect(journalTitle('invalid')).toBe('프로그램 일지'); expect(journalTitle('2026-10-25T12:00:00+09:00')).toBe('10월 25일 프로그램 일지');
    expect(dayKey('invalid')).toBe(''); expect(dayKey('2026-10-25T12:00:00+09:00')).toBe('2026-10-25');
    expect(durationLabel(null, null)).toBeNull(); expect(durationLabel(10, null)).toBe('10분');
    expect(durationLabel(10, 0)).toBe('1분'); expect(durationLabel(10, 121)).toBe('2분');
    expect(secondsParts(null)).toBeNull(); expect(secondsParts(0)).toEqual([{ n: '0', unit: '분' }]);
    expect(secondsParts(61)).toEqual([{ n: '1', unit: '분 ' }, { n: '1', unit: '초' }]);
    expect(Y(122)).toBe(0);
  });
  test.each(['/caregiver/supervision', '/caregiver/supervision/session'])('fluid exact namespace %s', path => expect(isFluidPath(path)).toBe(true));
  test.each(['/', '/guardian', '/caregiver/supervisionevil'])('fixed namespace %s', path => expect(isFluidPath(path)).toBe(false));
  test('error dispatch respects known code/raw/fallback branches', () => {
    const table = { EXACT_CODE: '안내' };
    expect(serverErrorMessage(table, new Error('prefix EXACT_CODE suffix'), 'fallback')).toBe('안내');
    expect(serverErrorMessage(table, 'raw', 'fallback')).toBe('raw');
    expect(serverErrorMessage(table, {}, 'fallback')).toBe('fallback');
    expect(serverErrorMessage(table, '', 'fallback')).toBe('fallback');
    expect(journalErrorMessage('JOURNAL_FINALIZE_HUMAN_ONLY')).toBe('일지 확정은 담당자가 직접 해야 해요.');
    expect(journalErrorMessage(null)).toBe('저장하지 못했어요.');
    expect(orgJoinErrorMessage('ORG_JOIN_SELF')).toBe('본인의 합류 요청은 승인할 수 없어요.');
    expect(orgJoinErrorMessage(null)).toBe('처리하지 못했어요.');
  });
});

describe('auth generation and delayed toast data-flow', () => {
  beforeEach(() => { vi.useFakeTimers(); useStore.getState().resetForAuth(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  test('old-generation callback cannot repopulate a new account UI', () => {
    const oldToast = useStore.getState().toast;
    oldToast('info', 'old');
    useStore.getState().resetForAuth();
    oldToast('error', 'must never leak');
    expect(useStore.getState().toasts).toEqual([]);
    useStore.getState().toast('success', 'new');
    expect(useStore.getState().toasts.map(t => t.message)).toEqual(['new']);
    vi.advanceTimersByTime(3199);
    expect(useStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useStore.getState().toasts).toEqual([]);
  });
  test('dismiss loop preserves other toast and accepts empty queue', () => {
    useStore.getState().dismissToast('missing');
    useStore.getState().toast('info', 'a'); useStore.getState().toast('info', 'b');
    const [first, second] = useStore.getState().toasts;
    useStore.getState().dismissToast(first.id);
    expect(useStore.getState().toasts).toEqual([second]);
  });
});

describe('photo storage query loops and failure propagation', () => {
  let storage;
  beforeEach(() => {
    storage = { createSignedUrls: vi.fn(), upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) };
    getGiokonClient.mockReturnValue({ storage: { from: vi.fn(() => storage) } });
  });
  test.each([useJournalPhotoUrls, useElderPhotoUrls])('empty/single/multiple map skips incomplete signed rows %#', async hook => {
    const empty = hook([], true); expect(empty.enabled).toBe(false);
    const disabled = hook(['p/a'], false); expect(disabled.enabled).toBe(false);
    const query = hook([undefined, '', 'p/b', 'p/a', 'p/b'], true);
    expect(query.queryKey[1]).toEqual(['p/a', 'p/b']); expect(query.enabled).toBe(true);
    storage.createSignedUrls.mockResolvedValue({ data: [{ path: 'p/a', signedUrl: 'signed-a' }, { path: 'p/b' }, { signedUrl: 'no-path' }], error: null });
    expect(await query.queryFn()).toEqual({ 'p/a': 'signed-a' });
    storage.createSignedUrls.mockResolvedValue({ data: null, error: null }); expect(await query.queryFn()).toEqual({});
    storage.createSignedUrls.mockResolvedValue({ error: { message: 'sign failed' } }); await expect(query.queryFn()).rejects.toThrow('sign failed');
  });
  test.each([uploadJournalPhoto, uploadElderPhoto])('upload uses profile prefix, no upsert, forwards errors %#', async upload => {
    const file = { name: 'A.PNG', type: 'image/png' };
    expect(await upload('synthetic-profile', file)).toMatch(/^synthetic-profile\/.*\.png$/);
    expect(storage.upload).toHaveBeenLastCalledWith(expect.any(String), file, { contentType: 'image/png', upsert: false });
    const noType = { name: 'empty.', type: '' };
    expect(await upload('synthetic-profile', noType)).toMatch(/\.jpg$/);
    expect(storage.upload).toHaveBeenLastCalledWith(expect.any(String), noType, { contentType: 'image/jpeg', upsert: false });
    storage.upload.mockResolvedValue({ error: { message: 'upload failed' } }); await expect(upload('p', file)).rejects.toThrow('upload failed');
  });
  test('remove empty/one/many and reject errors before record cleanup', async () => {
    await removeJournalPhotoFiles([]); expect(storage.remove).not.toHaveBeenCalled();
    await removeJournalPhotoFiles(['p/a']); await removeJournalPhotoFiles(['p/a', 'p/b']); expect(storage.remove).toHaveBeenCalledTimes(2);
    storage.remove.mockResolvedValue({ error: { message: 'remove failed' } });
    await expect(removeJournalPhotoFiles(['p/a'])).rejects.toThrow('remove failed');
    expect(useQuery).toHaveBeenCalled();
  });
});
