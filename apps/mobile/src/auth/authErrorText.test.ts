import { describe, expect, it } from 'vitest';
import { AUTH_ERROR_FALLBACK, authErrorText } from './authErrorText';

describe('authErrorText — 로그인 오류를 한국어로', () => {
  it('Supabase 오류 코드를 안내로 바꾼다', () => {
    expect(authErrorText(Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials' }))).toBe('이메일 또는 비밀번호가 맞지 않아요.');
  });
  it('코드가 없으면 영문 표현으로 알아본다', () => {
    expect(authErrorText(new Error('Email not confirmed'))).toContain('이메일 인증');
    expect(authErrorText(new TypeError('Network request failed'))).toContain('인터넷 연결');
  });
  it('이미 한국어인 안내는 그대로 둔다', () => {
    expect(authErrorText(new Error('로그인에 실패했습니다.'))).toBe('로그인에 실패했습니다.');
  });
  it('모르는 영문 원문은 보이지 않는다', () => {
    expect(authErrorText(new Error('AuthApiError: unexpected internal xyz'))).toBe(AUTH_ERROR_FALLBACK);
    expect(authErrorText(undefined, '다시 시도')).toBe('다시 시도');
  });
});
