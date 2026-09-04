// Live 오디오 재생 허용 판정.
//
// 모델이 돌려준 원문(raw)은 출력 가드(core `screenAiUtterance`)에 막힐 수 있다.
// 막히면 스토어가 화면 질문을 안전 대체문으로 바꾸는데, 오디오는 **원문 키**로
// 캐시돼 있어 그대로 재생하면 화면엔 안전한 문장 · 스피커엔 막힌 발화가 나간다.
// 어르신 대상 서비스에서 이 어긋남은 허용할 수 없다 → 여기서 한 곳으로 모아 막는다.

/**
 * 재생해도 되는 오디오 청크만 돌려준다.
 *
 * @param cache   질문 텍스트 → PCM 청크. 원문 키로 저장돼 있다.
 * @param raw     모델이 실제로 말한 원문(오디오와 짝이다).
 * @param adopted 화면에 채택된 텍스트(가드를 통과했거나 안전 대체문).
 *
 * `adopted !== raw` = 가드가 원문을 막았다는 뜻이다. 이때는 빈 배열을 돌려주고
 * 원문 오디오를 **캐시에서 버린다** — "다시 듣기"로도 되살아나지 못하게 한다.
 * 호출부는 빈 배열이면 재생을 건너뛰고, 자동 재생 이펙트가 채택 텍스트를
 * 기기 TTS 로 읽는다.
 */
export function playableChunks(
  cache: Map<string, string[]>,
  raw: string,
  adopted: string,
): string[] {
  if (adopted !== raw) {
    cache.delete(raw);
    return [];
  }
  return cache.get(adopted) ?? [];
}
