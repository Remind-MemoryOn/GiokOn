import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SessionReportRecord } from '@giokon/core'
import { getGiokonClient } from './client'

export async function requestSessionReport(sessionId: string): Promise<SessionReportRecord> {
  const { data, error } = await getGiokonClient().functions.invoke<{ report: SessionReportRecord }>('session-report', {
    body: { session_id: sessionId },
  })
  if (error) {
    let message = 'AI 분석을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.'
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json() as { error?: unknown }
        if (typeof body.error === 'string' && body.error.length <= 200) message = body.error
      } catch { /* An HTML proxy response is not suitable UI text. */ }
    }
    throw new Error(message)
  }
  if (data?.report?.schemaVersion !== 'session-report-v1' || data.report.sourceSessionId !== sessionId || !data.report.result?.journal?.length) throw new Error('AI 분석 응답을 확인하지 못했어요.')
  return data.report
}

export function useGenerateSessionReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: requestSessionReport,
    retry: false,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['session_analyses'] })
    },
  })
}
