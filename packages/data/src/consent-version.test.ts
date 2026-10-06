import { readdirSync, readFileSync } from 'node:fs'
import { CONSENT_VERSION } from '@giokon/core'
import { describe, expect, it } from 'vitest'

// 동의서 현행 버전 단일화(T24.4) — DB 는 public.current_consent_version() 한 곳, 앱·웹은 core CONSENT_VERSION 을 보낸다.
// 둘이 어긋나면 온보딩·동의 저장이 거절되므로, 그 함수의 **최신 정의**가 말하는 값과 core 상수가 같은지 여기서 확인한다.
const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url)
const DEFINITION = /create or replace function public\.current_consent_version\(\)[\s\S]*?select '([^']+)'::text/

function databaseConsentVersion(): string {
  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
  let version: string | null = null
  for (const file of files) {
    const match = DEFINITION.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'))
    if (match) version = match[1]!
  }
  if (!version) throw new Error('public.current_consent_version() 정의를 찾지 못했어요')
  return version
}

describe('동의서 현행 버전(T24.4)', () => {
  it('core CONSENT_VERSION 이 DB public.current_consent_version() 의 최신 정의와 같다', () => {
    expect(databaseConsentVersion()).toBe(CONSENT_VERSION)
  })
})
