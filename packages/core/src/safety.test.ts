import { describe, expect, it } from 'vitest'
import {
  SAFETY_EVIDENCE_PENDING_MS,
  safetyEvidenceState,
  AI_DISCLOSURE,
  AI_GENERATED_LABEL,
  assessEngagement,
  assessUtterance,
  buildCaregiverAlert,
  normalizeUtterance,
  screenAiUtterance,
} from './safety'

describe('normalizeUtterance — STT 변이 흡수', () => {
  it('공백·문장부호를 제거한다', () => {
    expect(normalizeUtterance('죽고  싶다...')).toBe('죽고싶다')
    expect(normalizeUtterance('숨이 안 쉬어져요!')).toBe('숨이안쉬어져요')
  })
})

describe('assessUtterance — 위기(자살·자해)', () => {
  it.each([
    '이제 그만 죽고 싶어',
    '죽고싶어', // 띄어쓰기 변이
    '자살하고 싶다는 생각이 들어',
    '영감 따라 가고 싶어', // 사별 후 수동적 소망
    '내가 없어야 자식들이 편하지', // 수동적 자살 사고(짐 인식)
    '약을 한꺼번에 먹어버릴까 싶어',
    '살고 싶지가 않아',
  ])('"%s" → crisis(self_harm) + 에스컬레이션', (text) => {
    const a = assessUtterance(text)
    expect(a.situation).toBe('crisis')
    expect(a.crisisCategories).toContain('self_harm')
    expect(a.escalate).toBe(true)
  })

  it('부정 문맥("생각은 안 해요")도 위기로 유지 — 판단은 사람이 한다', () => {
    expect(assessUtterance('죽고 싶다는 생각은 안 해요').situation).toBe('crisis')
  })

  // 실기기 실행서 SAFE-09 대리 검증(2026-10-26)에서 미탐 — 중계 음성 경로에는 모델 안전 판정이 없어 이 사전이 유일한 입력 감지다.
  it.each([
    '이제 내가 없어지는 게 낫겠네', // 실행서 SAFE-09 문장
    '내가 사라지는 게 낫지',
    '내가 없는 편이 낫겠어',
    '내가 없으면 다들 편하겠지',
    '내가 없어지면 다들 편하겠지',
    '없어져 버리고 싶어',
    '그냥 콱 죽어삐고 싶다', // 방언
    '죽고 잡다',
    '죽고파',
    '살아서 뭐 하나 싶어',
    '이렇게 살아 뭐해',
    '더 살아서 뭐 하겠어',
    '아침에 눈을 안 떴으면 좋겠어',
    '자다가 안 깨어났으면',
    '자는 듯이 가고 싶어',
  ])('완곡·방언 "%s" → crisis(self_harm)', (text) => {
    const a = assessUtterance(text)
    expect(a.situation).toBe('crisis')
    expect(a.crisisCategories).toContain('self_harm')
    expect(a.escalate).toBe(true)
  })

  it.each([
    '어릴 때 숨바꼭질하다 내가 없어지니까 엄마가 찾으러 왔어',
    '서울에 살아서 뭐 해 먹고 살았냐면 국수 장사를 했지',
    '짐이 다 없어지면 좋겠어',
    '아기가 안 깨어났으면 해서 살금살금 다녔어',
    '어젯밤엔 자다가 안 깨고 푹 잤어',
  ])('회상 일상 "%s" → 위기 아님', (text) => {
    expect(assessUtterance(text).escalate).toBe(false)
  })
})

describe('assessUtterance — 위기(응급·학대)', () => {
  it.each([
    '숨이 안 쉬어져요',
    '가슴이 조여와',
    '말이 잘 안 나오고 한쪽 팔이 안 움직여', // 뇌졸중 신호
    '넘어져서 못 일어나겠어',
    '구급차 좀 불러줘',
  ])('"%s" → crisis(medical_emergency)', (text) => {
    const a = assessUtterance(text)
    expect(a.situation).toBe('crisis')
    expect(a.crisisCategories).toContain('medical_emergency')
  })

  it.each([
    '아들이 자꾸 때려',
    '밥을 안 줘서 하루 종일 굶었어',
    '통장을 뺏어 갔어',
    '방에 가둬 놓고 못 나가게 해',
  ])('"%s" → crisis(abuse)', (text) => {
    const a = assessUtterance(text)
    expect(a.situation).toBe('crisis')
    expect(a.crisisCategories).toContain('abuse')
  })

  it('복합 위기(자살+응급)는 self_harm을 우선 분류한다', () => {
    const a = assessUtterance('가슴이 조여오고, 이제 그만 죽고 싶어')
    expect(a.crisisCategories[0]).toBe('self_harm')
  })
})

describe('assessUtterance — 오탐 방지(일상 발화)', () => {
  it.each([
    '아침에 죽 한 그릇 맛있게 먹었어', // 죽(porridge)
    '어제 예방주사 맞았어', // 주사 맞다
    '옛날에 전주에서 식당을 했지',
    '병원에 정기검진 다녀왔어', // 병원 언급만으로 전환하지 않는다
    '우리 손주가 유치원에서 상을 받았대',
  ])('"%s" → normal (위기·전환 아님)', (text) => {
    const a = assessUtterance(text)
    expect(a.situation).toBe('normal')
    expect(a.escalate).toBe(false)
  })

  it('"보고 싶어 죽겠네"는 관용구 — 위기가 아니라 그리움(grief)', () => {
    const a = assessUtterance('영감이 보고 싶어 죽겠네')
    expect(a.situation).toBe('grief')
    expect(a.escalate).toBe(false)
  })
})

describe('assessUtterance — 애도·고통·중단·거부·혼란', () => {
  it('상실·그리움은 grief(회피·에스컬레이션 아님)', () => {
    const a = assessUtterance('남편이 먼저 돌아가셨어요')
    expect(a.situation).toBe('grief')
    expect(a.risk).toBe('grief')
    expect(a.escalate).toBe(false)
  })

  it('외로움도 grief로 받는다', () => {
    expect(assessUtterance('요즘은 너무 외로워').situation).toBe('grief')
  })

  it('짐 인식 표현은 distress(watch) — 노인 자살 선행 신호 관찰', () => {
    const a = assessUtterance('자식들한테 짐만 되는 것 같아')
    expect(a.situation).toBe('distress')
    expect(a.risk).toBe('watch')
  })

  it('중단 요청은 rest_request — 즉시 존중', () => {
    expect(assessUtterance('오늘은 그만하고 싶어').situation).toBe('rest_request')
    expect(assessUtterance('피곤해').situation).toBe('rest_request')
  })

  it('고통+중단 복합 → 중단 존중 + 고통 신호 보존(보호자 알림 유지)', () => {
    const a = assessUtterance('너무 힘들어서 그만하고 싶어')
    expect(a.situation).toBe('rest_request')
    expect(a.hasDistressSignal).toBe(true)
    expect(a.risk).toBe('watch')
    expect(buildCaregiverAlert(a)).toBeTruthy()
  })

  it('거부·짜증은 refusal', () => {
    expect(assessUtterance('듣기 싫어').situation).toBe('refusal')
    expect(assessUtterance('왜 자꾸 물어').situation).toBe('refusal')
  })

  it('지남력 혼란은 confusion', () => {
    expect(assessUtterance('여기가 어디야?').situation).toBe('confusion')
    expect(assessUtterance('누구세요?').situation).toBe('confusion')
  })

  it('빈 발화는 silence', () => {
    expect(assessUtterance('   ').situation).toBe('silence')
  })
})

describe('buildCaregiverAlert', () => {
  it('자살 위기 → 109 안내 포함', () => {
    expect(buildCaregiverAlert(assessUtterance('죽고 싶어'))).toContain('109')
  })
  it('응급 → 119 안내 포함', () => {
    expect(buildCaregiverAlert(assessUtterance('숨이 안 쉬어져'))).toContain('119')
  })
  it('학대 → 1577-1389 안내 포함', () => {
    expect(buildCaregiverAlert(assessUtterance('아들이 자꾸 때려'))).toContain('1577-1389')
  })
  it('일반·애도는 알림 없음', () => {
    expect(buildCaregiverAlert(assessUtterance('고향 생각이 나'))).toBeNull()
    expect(buildCaregiverAlert(assessUtterance('영감이 그리워'))).toBeNull()
  })
})

describe('assessEngagement — 관여도', () => {
  it('빈 발화는 silent', () => {
    expect(assessEngagement('')).toBe('silent')
  })
  it('단답·맞장구는 low', () => {
    expect(assessEngagement('네')).toBe('low')
    expect(assessEngagement('글쎄요')).toBe('low')
    expect(assessEngagement('몰라요')).toBe('low')
    expect(assessEngagement('기억이 안 나')).toBe('low')
  })
  it('서사 표지가 있으면 rich', () => {
    expect(assessEngagement('그때 동네 사람들이 다 모여서 잔치를 했었지')).toBe('rich')
    expect(assessEngagement('옛날에 시장에서 국수 팔았어')).toBe('rich')
  })
  it('긴 이야기는 rich', () => {
    expect(assessEngagement('전주 시장에서 삼십 년 동안 국밥집을 하면서 애들 셋을 다 키웠어')).toBe('rich')
  })
  it('보통 답변은 normal', () => {
    expect(assessEngagement('국수를 팔았어')).toBe('normal')
  })
})

describe('screenAiUtterance — 출력 가드레일', () => {
  it('의학적 진단 단정 차단', () => {
    const s = screenAiUtterance('어르신은 치매입니다. 병원 가지 마세요.')
    expect(s.allowed).toBe(false)
    expect(s.safeAlternative).toBeTruthy()
  })
  it('약 지시 차단', () => {
    expect(screenAiUtterance('그 약을 끊으세요').allowed).toBe(false)
  })
  // 실기기 실행서 SAFE-10("약을 얼마나 먹으면 돼요") 대리 검증(2026-10-26) — 사이에 말이 끼면 '약을드세요' 구가 맞지 않았다.
  it.each([
    '약을 하루 두 알 드세요',
    '그 약은 식후에 드시면 돼요',
    '혈압약은 꼭 챙겨 드세요',
    '약은 반 알만 드셔도 돼요',
    '두 알 정도 먹으면 괜찮아요',
    '한 알씩 드시면 좋아요',
  ])('복용 지시 "%s" 차단', (text) => {
    expect(screenAiUtterance(text).allowed).toBe(false)
  })
  it.each([
    '약과 하나 드셨어요?',
    '약밥 맛있게 드셨어요?',
    '약속 장소에서 국수 드셨어요?',
    '약수터 물을 떠다 드셨어요?',
    '농약 치고 나서 점심은 뭘 드셨어요?',
    '몸이 약해지셨을 때 어머니가 죽을 끓여 주셨어요?',
    '밤 한 알 드셨던 기억이 나세요?',
  ])('음식·일상 회상 "%s" 통과', (text) => {
    expect(screenAiUtterance(text).allowed).toBe(true)
  })
  it('교정·직면("아까 말씀하셨잖아요") 차단 — validation 원칙', () => {
    expect(screenAiUtterance('아까 말씀하셨잖아요, 기억 안 나세요?').allowed).toBe(false)
  })
  it('기억 시험 차단', () => {
    expect(screenAiUtterance('따님 성함 기억 안 나세요?').allowed).toBe(false)
  })
  it('유해·모욕 차단', () => {
    expect(screenAiUtterance('그것도 몰라요? 답답하시네').allowed).toBe(false)
  })
  it('정상 회상 질문·공감은 통과', () => {
    expect(screenAiUtterance('어르신, 전주에서 제일 기억에 남는 게 뭐예요?').allowed).toBe(true)
    expect(screenAiUtterance('많이 그리우시지요. 그런 마음이 드는 게 당연해요.').allowed).toBe(true)
  })
})

describe('투명성 고지 상수', () => {
  it('AI 이용 고지·생성물 라벨을 제공한다', () => {
    expect(AI_DISCLOSURE).toContain('AI')
    expect(AI_GENERATED_LABEL).toContain('AI')
  })
})

describe('safetyEvidenceState (T25.17 — 빈 발췌 표시)', () => {
  const at = '2026-09-29T10:00:00.000Z'
  const t = Date.parse(at)
  it('발췌가 있으면 present', () => {
    expect(safetyEvidenceState('숨이 안 쉬어져요', at, t + 10 * 60_000)).toBe('present')
  })
  it('비어 있으면 감지 후 2분 동안은 저장 중(중계 재시도 창)', () => {
    expect(safetyEvidenceState(null, at, t + 30_000)).toBe('pending')
    expect(safetyEvidenceState('  ', at, t + SAFETY_EVIDENCE_PENDING_MS - 1)).toBe('pending')
  })
  it('창을 넘기면 저장 실패 — 근거를 지어내지 않는다', () => {
    expect(safetyEvidenceState(null, at, t + SAFETY_EVIDENCE_PENDING_MS)).toBe('missing')
    expect(safetyEvidenceState('', at, t + 60 * 60_000)).toBe('missing')
  })
  it('시각을 읽지 못하면 실패로 본다', () => {
    expect(safetyEvidenceState(null, 'not-a-date', t)).toBe('missing')
  })
})
