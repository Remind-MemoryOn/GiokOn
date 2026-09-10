// @giokon/data — 음성→텍스트(STT) via Edge Function(stt-transcribe)
//
// CLOVA Speech Recognition(CSR) 키는 서버 시크릿(NCP_CLOVA_CLIENT_ID/SECRET)이라
// 클라이언트가 직접 CLOVA 를 호출하지 않는다. 오디오 파일을 Edge Function 으로
// 보내면 서버가 CLOVA 로 인식해 텍스트를 돌려준다(키 보호 + CORS 회피).
// Edge Function 미배포 시 invoke 가 에러 → 호출부에서 안내한다.

import { getGiokonClient } from './client'

export interface TranscribeOptions {
  /** 대상 어르신. 서버에서 담당 권한과 현재 동의를 확인한다. */
  profileId: string
  /** 인식 언어(기본 Kor). CLOVA CSR: Kor/Eng/Jpn/Chn 등. */
  lang?: string
}

/**
 * 오디오 파일/블롭을 텍스트로 변환한다(Edge Function stt-transcribe → CLOVA CSR).
 * @returns 인식된 텍스트.
 */
export async function transcribeAudio(
  file: File | Blob,
  opts: TranscribeOptions,
): Promise<string> {
  const form = new FormData()
  const name = file instanceof File ? file.name : 'audio'
  form.append('audio', file, name)
  form.append('lang', opts.lang ?? 'Kor')

  const { data, error } = await getGiokonClient().functions.invoke('stt-transcribe', {
    body: form,
    headers: { 'x-profile-id': opts.profileId },
  })
  if (error) throw error
  const text = (data as { text?: string } | null)?.text
  if (typeof text !== 'string') {
    throw new Error('음성 인식 결과를 받지 못했습니다.')
  }
  return text
}
