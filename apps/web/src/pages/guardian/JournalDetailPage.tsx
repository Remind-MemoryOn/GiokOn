// 보호자 — 요양일지 상세 (Figma 50:1102 — 1440×1324)
//   돌아가기 @(322,187.14) · 배지 107×35 @(343,260) · 제목 @(362,292) ·
//   담당 요양보호사 @(362,356.27) · 카드 1054×804.61 @(322,432.33)
//   오늘의 활동 @(408,479) → 값 @(408,543.41) · 요양일지 @(408,607) → 본문 690 @(408,671.51)
//   오늘의 활동 사진 @(408,903) → 사진 281×177 @(408/708/1009, 972)
//
// 파일럿 W3(2026-09-27): 보호자 쪽 이름 '요양일지' → '오늘의 이야기'(배지 폭 107 → 130 · 섹션 제목) — 확정된 프로그램 일지의
//    보호자 문장만 보여 준다(공단 서식은 서버가 보내지 않는다).
// 섹션 간격은 이 화면 실측(본문 끝 → 다음 제목 상자 35.35)을 쓴다 — 본문 줄 수가
// 데이터마다 달라도 리듬이 유지되도록 흐름 배치로 그린다.
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useMySharedContent } from '@giokon/data';
import { useAuth } from '../../auth/AuthProvider';
import { useJournalPhotoUrls } from '../../lib/journalPhotos';
import {
  BackLink, CARD_TOP, DetailHead, PAD_TOP, PAD_X, SectionBody, SectionTitle, Y,
} from '../../components/guardian-detail';
import { useMarkShareViewedOnce } from '../../lib/shareViewed';

/** 본문 끝 → 다음 섹션 제목 상자 top. */
const SEC_GAP = 35.35;

/** `09:00:00` → `09:00`. 없으면 만들지 않고 `—`. */
const hhmm = (t: string | null | undefined) => t?.slice(0, 5) ?? '—';
/** 사진 — 3열(281/282/281 × 177), x 408/708/1009 → 카드 안 오프셋 0/300/601. */
const PHOTO = { w: 281, h: 177, xs: [0, 300, 601] };

export function JournalDetailPage() {
  const { itemId } = useParams();
  const { isConfigured } = useAuth();
  const shared = useMySharedContent({ enabled: isConfigured });

  const journal = (shared.data?.journals ?? []).find((j) => j.id === itemId) ?? null;
  const share = (shared.data?.shares ?? []).find(
    (s) => s.item_type === 'journal' && s.item_id === itemId && !s.revoked_at,
  );
  const photos = useMemo(
    () => (shared.data?.photos ?? [])
      .filter((p) => p.journal_id === itemId)
      .sort((a, b) => a.sort - b.sort),
    [shared.data, itemId],
  );
  const urls = useJournalPhotoUrls(photos.map((p) => p.path), isConfigured);

  // 보호자가 열어 본 사실을 남긴다(공개 id 당 한 번).
  useMarkShareViewedOnce(share?.id, isConfigured);

  const d = journal ? new Date(journal.journal_date) : null;
  const title = d && !Number.isNaN(d.getTime())
    ? `${d.getMonth() + 1}월 ${d.getDate()}일 오늘의 이야기`
    : '오늘의 이야기';

  return (
    <div className="relative -ml-[323px] w-[1440px]" style={{ minHeight: Y(1324) }}>
      <BackLink to="/guardian/feed?tab=journal" />
      <DetailHead
        fx={{ badge: '50:1074', label: '50:1075', at: '50:1076', title: '50:1073', author: '50:1077' }}
        badge="오늘의 이야기"
        tone="journal"
        badgeW={130}
        at={share?.shared_at ?? journal?.finalized_at ?? ''}
        title={title}
      />

      <div
        data-fx="50:1086"
        className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{
          top: Y(CARD_TOP),
          paddingLeft: PAD_X, paddingRight: PAD_X, paddingTop: PAD_TOP, paddingBottom: 87.93,
        }}
      >
        <SectionTitle fx="50:1083">오늘의 활동</SectionTitle>
        <SectionBody fx="50:1084" under>
          {/* 활동 시간 — 요양보호사가 적었을 때만 나온다. 적지 않았으면 지어내지 않고 `—`. */}
          {journal?.operated_from || journal?.operated_to
            ? `${hhmm(journal.operated_from)} ~ ${hhmm(journal.operated_to)}`
            : '—'}
        </SectionBody>

        <SectionTitle fx="50:1088" gap={SEC_GAP}>오늘의 이야기</SectionTitle>
        <SectionBody fx="50:1089" under pre width={690}>
          {/* D5: 보호자에게는 승인된 보호자 문장만(공단 서식 칸은 서버가 보내지 않는다 — 계획 W4). */}
          {journal?.guardian_text ?? '—'}
        </SectionBody>

        <SectionTitle fx="50:1093" gap={SEC_GAP}>오늘의 활동 사진</SectionTitle>
        {photos.length === 0 ? (
          <SectionBody className="!text-ink-500" style={{ marginTop: -5.54 }}>
            공개된 활동 사진이 아직 없어요.
          </SectionBody>
        ) : (
          <div className="relative" style={{ marginTop: -1, height: PHOTO.h }}>
            {photos.slice(0, PHOTO.xs.length).map((p, i) => (
              <img
                key={p.id}
                data-fx={i === 0 ? '50:1096' : undefined}
                src={urls.data?.[p.path]}
                alt={p.caption ?? title}
                className="absolute top-0 block rounded-[10px] bg-cream-100 object-cover"
                style={{ left: PHOTO.xs[i], width: PHOTO.w, height: PHOTO.h }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
