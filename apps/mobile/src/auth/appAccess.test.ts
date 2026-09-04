import { describe, it, expect } from 'vitest';
import { evaluateAppAccess, type AccessUserRow } from './appAccess';

const caregiver: AccessUserRow = {
  role: 'caregiver',
  org_id: 'org-1',
  onboarded_at: '2026-01-01T00:00:00Z',
};

describe('evaluateAppAccess — 앱 진입 자격', () => {
  it('조회 중이면 판정을 미룬다', () => {
    expect(evaluateAppAccess({ authed: false, loading: true, userRow: null }).status).toBe('loading');
  });

  it('미로그인은 로그인으로', () => {
    expect(evaluateAppAccess({ authed: false, loading: false, userRow: null }).status).toBe(
      'unauthenticated',
    );
  });

  it('온보딩 마친 요양보호사는 통과', () => {
    expect(evaluateAppAccess({ authed: true, loading: false, userRow: caregiver }).status).toBe('ok');
  });

  it('기관 관리자도 통과한다', () => {
    expect(
      evaluateAppAccess({ authed: true, loading: false, userRow: { ...caregiver, role: 'org_admin' } })
        .status,
    ).toBe('ok');
  });

  it('보호자 계정은 막는다 — 이 앱은 요양보호사용이다', () => {
    const r = evaluateAppAccess({
      authed: true,
      loading: false,
      userRow: { ...caregiver, role: 'guardian' },
    });
    expect(r.status).toBe('blocked');
    if (r.status === 'blocked') expect(r.title).toContain('보호자');
  });

  it('기관 없는 계정은 막는다 — org_id not-null 위반을 화면에서 미리 잡는다', () => {
    expect(
      evaluateAppAccess({ authed: true, loading: false, userRow: { ...caregiver, org_id: null } })
        .status,
    ).toBe('blocked');
  });

  it('온보딩 미완료 계정은 막는다', () => {
    expect(
      evaluateAppAccess({
        authed: true,
        loading: false,
        userRow: { ...caregiver, onboarded_at: null },
      }).status,
    ).toBe('blocked');
  });

  it('로그인됐는데 계정 행을 못 읽으면 통과시키지 않는다(빈 화면 오해 방지)', () => {
    expect(evaluateAppAccess({ authed: true, loading: false, userRow: null }).status).toBe('blocked');
  });
});
