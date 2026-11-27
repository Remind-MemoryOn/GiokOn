// 운영자에게 보내는 요청 — 계정 삭제 요청 · AI 응답 신고(2026-11-27 Play 출시 준비).
//
// 둘 다 **본인 명의의 비공개 문의**(`inquiries`, visibility='private')로 넣는다. RLS 가 작성자 본인만
// 넣게 하고(author_id = auth.uid(), status = 'waiting'), 읽기는 작성자와 사이트 운영자만 된다.
// 제목·본문 규칙은 core `support-requests.ts`, 운영 처리 절차는 `docs/runbooks/account-deletion-and-ai-reports.md`.
//
// 서버 오류 원문은 화면에 보이지 않는다(영문 DB 메시지 대신 한국어 안내).
import {
  ACCOUNT_DELETION_TITLE,
  buildAccountDeletionInquiry,
  buildAiReportInquiry,
  type AccountDeletionRequestInput,
  type AiReportInput,
} from '@giokon/core'
import { getGiokonClient } from './client'

const TIMEOUT_MS = 10_000

async function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    return await run(abort.signal)
  } finally {
    clearTimeout(timer)
  }
}

export interface AccountDeletionRequestResult {
  /** created = 이번에 접수 · existing = 이미 처리 대기 중인 요청이 있어 새로 만들지 않음. */
  status: 'created' | 'existing'
  inquiryId: string
  requestedAt: string
}

/** 처리 대기 중인 본인 계정 삭제 요청(가장 최근). 없으면 null. */
export async function findPendingAccountDeletionRequest(userId: string): Promise<{ id: string; created_at: string } | null> {
  const { data, error } = await withTimeout((signal) =>
    getGiokonClient()
      .from('inquiries')
      .select('id, created_at')
      .eq('author_id', userId)
      .eq('title', ACCOUNT_DELETION_TITLE)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(1)
      .abortSignal(signal),
  )
  if (error) throw new Error('접수 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
  return data?.[0] ?? null
}

/**
 * 계정 삭제를 요청한다. 이미 대기 중인 요청이 있으면 새로 만들지 않고 그 접수일을 돌려준다
 * (여러 번 눌러도 운영자 목록에 중복이 쌓이지 않게).
 */
export async function requestAccountDeletion(
  userId: string,
  input: AccountDeletionRequestInput,
): Promise<AccountDeletionRequestResult> {
  const pending = await findPendingAccountDeletionRequest(userId)
  if (pending) return { status: 'existing', inquiryId: pending.id, requestedAt: pending.created_at }

  const { title, content } = buildAccountDeletionInquiry(input)
  const { data, error } = await withTimeout((signal) =>
    getGiokonClient()
      .from('inquiries')
      .insert({ author_id: userId, title, content, visibility: 'private' })
      .select('id, created_at')
      .abortSignal(signal)
      .single(),
  )
  if (error || !data) throw new Error('삭제 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
  return { status: 'created', inquiryId: data.id, requestedAt: data.created_at }
}

/** AI 응답을 운영자에게 신고한다. 신고는 매번 새로 접수한다(같은 대화의 다른 발화일 수 있다). */
export async function reportAiResponse(userId: string, input: AiReportInput): Promise<{ inquiryId: string }> {
  const { title, content } = buildAiReportInquiry(input)
  const { data, error } = await withTimeout((signal) =>
    getGiokonClient()
      .from('inquiries')
      .insert({ author_id: userId, title, content, visibility: 'private' })
      .select('id')
      .abortSignal(signal)
      .single(),
  )
  if (error || !data) throw new Error('신고를 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
  return { inquiryId: data.id }
}
