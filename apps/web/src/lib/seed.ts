import { useStore } from '../store/store';

export function seedIfEmpty() {
  const { elders, upsertElder, upsertSession, upsertChronicle } = useStore.getState();
  if (elders.length > 0) return;

  // 이순자: 캐릭터 미설정 — 어르신이 직접 처음 꾸미기 시나리오용
  const sun = upsertElder({
    name: '이순자',
    birthYear: 1945,
    hometown: '전북 전주',
    job: '식당 운영, 30년',
    family: '딸 둘, 사위 둘, 손자 셋',
    hobbies: '텃밭 가꾸기, 화투',
    guardian: { name: '박민준', relation: '아들' },
    // appearance 생략 → DEFAULT_APPEARANCE 사용
  });

  const bok = upsertElder({
    name: '김복례',
    birthYear: 1942,
    hometown: '경상남도 진주',
    job: '재봉틀 가게 운영',
    family: '아들 하나, 며느리, 손녀 둘',
    hobbies: '뜨개질',
    guardian: { name: '김지영', relation: '딸' },
    appearance: {
      skin: 'light',
      hair: 'permed_white',
      outfit: 'cardigan_warm',
      accessory: 'reading_glasses',
      background: 'living_room',
    },
  });

  upsertElder({
    name: '박정환',
    birthYear: 1950,
    hometown: '강원도 춘천',
    job: '공무원 정년퇴직',
    family: '아내, 아들 둘',
    hobbies: '바둑, 산책',
    guardian: { name: '박지훈', relation: '아들' },
    appearance: {
      skin: 'tan',
      hair: 'short_gray',
      outfit: 'sweater_brown',
      accessory: 'glasses',
      background: 'sunset',
    },
  });

  // 이순자 — 세션 2개 (회상 + 음악)
  upsertSession({
    title: '오늘의 회상 대화',
    therapyType: 'reminiscence',
    note: '편안한 분위기에서 천천히 진행',
    durationMinutes: 10,
    elderId: sun.id,
  });

  upsertSession({
    title: '옛 노래 한 곡',
    therapyType: 'music',
    note: '젊은 시절 듣던 노래 떠올리기',
    durationMinutes: 8,
    elderId: sun.id,
  });

  // 이순자 — 사전 등록 연대기
  upsertChronicle({
    elderId: sun.id,
    topic: '직업',
    content: '전주 시내에서 30년 동안 백반 식당을 운영했다. 김치찌개와 된장찌개가 단골 메뉴였다.',
    keywords: ['식당', '전주', '김치', '백반'],
    source: 'Caregiver',
  });

  // 김복례 — 세션 1개
  upsertSession({
    title: '진주 추억 회상',
    therapyType: 'reminiscence',
    note: '재봉틀 가게 시절 회상',
    durationMinutes: 10,
    elderId: bok.id,
  });
}
