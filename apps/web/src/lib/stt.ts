// 음성 → 텍스트 — Edge Function `stt-transcribe`(NCP CLOVA) 호출.
//
// 키는 서버 시크릿이라 브라우저에 두지 않는다. 함수는 JWT 검증을 켠 채 배포하므로
// (`--no-verify-jwt` 를 **쓰지 않는다**) 로그인한 사용자만 부를 수 있다 —
// 그렇지 않으면 누구나 쓰는 전사 API 가 되고 호출마다 비용이 나간다.
//
// ⚠️ 함수가 아직 배포되지 않았거나 CLOVA 키가 없으면 **분명한 오류를 던진다**.
//    조용히 실패해서 빈 칸을 남기면 요양보호사는 "인식이 안 되는 음성"이라고 오해하고
//    다시 녹음한다. 무엇이 빠졌는지 말해 주는 편이 낫다.
import { getGiokonClient } from '@giokon/data';

export class SttUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SttUnavailableError';
  }
}

/**
 * 오디오 파일을 전사한다. 성공하면 인식 텍스트, 실패하면 이유를 담아 throw.
 * 결과는 **원문 칸에 넣어 사람이 고친 뒤** 저장한다(자동 저장 금지).
 */
export async function transcribeAudio(file: File, lang = 'Kor'): Promise<string> {
  const form = new FormData();
  form.append('audio', file);
  form.append('lang', lang);

  const { data, error } = await getGiokonClient().functions.invoke<{
    text?: string;
    error?: string;
  }>('stt-transcribe', { body: form });

  if (error) {
    // 배포 안 됨(404)·시크릿 없음(500)·권한(401) 을 구분해 무엇을 해야 하는지 말한다.
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 404) {
      throw new SttUnavailableError(
        '음성 인식 기능이 아직 서버에 배포되지 않았어요. 원문을 직접 적어 주세요.',
      );
    }
    if (status === 401 || status === 403) {
      throw new SttUnavailableError('로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.');
    }
    throw new SttUnavailableError(
      error.message || '음성 인식에 실패했어요. 원문을 직접 적어 주세요.',
    );
  }
  if (data?.error) throw new SttUnavailableError(data.error);

  const text = (data?.text ?? '').trim();
  if (!text) {
    // 인식 결과가 비었으면 **빈 값을 넣지 않는다** — 없는 결과를 만들지 않는다.
    throw new SttUnavailableError(
      '음성에서 텍스트를 찾지 못했어요. 조용한 곳에서 다시 녹음하거나 직접 적어 주세요.',
    );
  }
  return text;
}
