// 모의 STT — 실 STT(gpt-4o-transcribe/Clova) 연동 전, 마이크 탭 시 어르신 발화를
// 시뮬레이션한다. 실연동 시 SpeechProvider.startStt의 onFinal 텍스트로 대체된다.
// 대화 진행·안전 가드는 전적으로 @giokon/core가 담당하므로 여기는 입력 소스일 뿐이다.

const POOL: Record<string, string[]> = {
  고향: [
    '전주 남부시장 근처에서 오래 살았지. 사람 냄새가 참 좋았어.',
    '어릴 적엔 골목마다 아이들이 뛰어놀았어.',
  ],
  가족: [
    '딸 둘 시집 보내던 날이 아직도 생생해.',
    '손주들 오면 그렇게 반가울 수가 없어.',
  ],
  직업: [
    '식당을 삼십 년 했어. 새벽부터 국을 끓였지.',
    '장사가 잘될 땐 앉을 새도 없었어.',
  ],
  취미: ['요즘은 텃밭에 상추랑 고추를 심어.', '흙 만지고 있으면 마음이 편해져.'],
  음식: ['잔칫날엔 늘 국수를 삶았지.', '김치는 아직도 내가 제일 잘 담가.'],
  마무리: ['오늘 이야기 참 좋았어. 고마워.', '그래, 다음에 또 얘기하자고.'],
};

const GENERIC = [
  '그때가 참 좋았지.',
  '글쎄, 오래돼서 가물가물해.',
  '음… 그런 일도 있었네.',
  '자네가 물어보니 또 생각이 나네.',
];

/** 현재 주제와 턴 수에 맞춰 그럴듯한 어르신 발화를 하나 고른다(결정론적 회전). */
export function pickElderUtterance(topic: string, turnCount: number): string {
  const pool = POOL[topic] ?? GENERIC;
  return pool[turnCount % pool.length];
}
