// 대화 기록 (Figma 178:1052 — 1440×2953)
//   제목 @169 · 부제 @236.16 · 목록으로 @(1285,187.13) · 카드 1054 @(322,315)
//   카드 안(카드 좌상단 기준): 날짜 머리 Bold 25/70 @(87,42) · 재생바 369×57 r10 @(605,50)
//   첫 말풍선 @135 · 세로 간격 57 · 아래 여백 81
//   AI 왼쪽  — 아바타 52 @80 · 상자 +18 · 시각 +11
//   어르신 오른쪽 — 아바타 오른끝 @974 · 상자 −18 · 시각 −10 (좌우 여백 80 대칭)
//   상자 r15(꼬리 쪽 모서리만 각짐) shadow-bubble · 글자 Regular 20/30
//
// ⚠️ 어르신 말풍선은 **좌우 반전 노드**라 metadata x(1226)가 왼쪽이 아니라 **오른끝**이다.
// ⚠️ 시안은 칸마다 상자 크기를 손으로 줬다(같은 줄 수인데 73/105 등) → 구현은 글자를
//    감싸는 패딩으로 만든다. 세로 간격 57 과 좌우 기준선은 실측 그대로.
// ⚠️ **재생바는 '녹음 없음'** — 세션 음성 저장은 아직 구현 범위가 아니다(동의·보관정책 필요).
//    시안의 "00:00 / 14:12" 는 자리표시자라 값을 만들지 않는다(앱 `log/[id]` 과 같은 판단).
import { Link, useParams } from 'react-router-dom';
import { useProfile, useSession, useSessionLogs } from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useElderPhotoUrls } from '../../lib/elderPhotos';
import { Avatar } from '../../components/ui/Avatar';
import { Y } from '../../lib/figmaY';
import { useElderProfile } from '../../lib/elderProfile';

const CARD_TOP = 315;
/** 카드 안 첫 말풍선 위치와 말풍선 사이 간격(시안 전 구간 57 — 마지막 3칸만 흘렸다). */
const FIRST_TURN = 135;
const TURN_GAP = 57;
const CARD_PAD_BOTTOM = 81;
const BUBBLE_MAX = 454;
const AVATAR = 52;
/** 카드 좌우 여백 — 아바타 바깥선 기준 80 으로 대칭이다. */
const SIDE = 80;

/** 시각 표기 — `오전 10:17`. 값이 없으면 만들지 않는다. */
function clock(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h < 12 ? '오전' : '오후'} ${h12}:${m}`;
}

/** 날짜 머리 — `2026년 6월 24일 (수)`. */
function dayHeading(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
}

export function ConversationLogPage() {
  const { elderId, sessionId } = useParams<{ elderId: string; sessionId: string }>();
  const { isConfigured } = useAuth();
  const profileQuery = useProfile(elderId);
  const session = useSession(sessionId);
  const logs = useSessionLogs(sessionId);

  const elder = useElderProfile(profileQuery.data);
  const photos = useElderPhotoUrls(elder?.photoPath ? [elder.photoPath] : [], isConfigured);
  const turns = logs.data ?? [];
  const heading = dayHeading(session.data?.started_at);

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px] pb-[89px]">
      <h1
        data-fx="178:1094"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-ink-900"
        style={{ top: Y(169) }}
      >
        {elder ? `${elder.name} 어르신의 대화 기록` : '대화 기록'}
      </h1>
      <p
        data-fx="178:1095"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.16) }}
      >
        세션 자동 분석(호응 주제·관찰 지표)은 분석 페이지에서 확인할 수 있어요.
      </p>
      <Link
        to={`/caregiver/sessions/${elderId ?? ''}`}
        data-fx="187:1260"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(187.13) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        목록으로
      </Link>

      {/* 카드 — 대화가 길어지면 같이 늘어난다(시안은 16턴 고정 높이) */}
      <div
        data-fx="187:1282"
        className="relative ml-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ marginTop: Y(CARD_TOP), paddingTop: FIRST_TURN, paddingBottom: CARD_PAD_BOTTOM }}
      >
        <h2
          data-fx="187:1283"
          className="absolute left-[87px] top-[42px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        >
          {heading}
        </h2>

        {/* 재생바 — 세션 음성 저장이 아직 없어 '녹음 없음' 상태로 둔다 */}
        <div
          data-fx="189:1578"
          className="absolute left-[605px] top-[50px] flex h-[57px] w-[369px] items-center justify-center rounded-[10px] border border-line-mid"
        >
          <span className="text-w-sub leading-[30px] text-ink-500">녹음 없음</span>
        </div>

        <div className="flex flex-col" style={{ gap: TURN_GAP }}>
          {turns.length === 0 ? (
            <p className="text-w-body leading-[30px] text-ink-500" style={{ marginLeft: SIDE + AVATAR + 18 }}>
              {isConfigured
                ? '이 세션에는 기록된 대화가 없습니다.'
                : 'Supabase 연동 후 대화 전문이 표시됩니다.'}
            </p>
          ) : (
            turns.map((turn, i) => {
              const time = clock(turn.spoken_at ?? turn.created_at);
              return turn.role === 'ai' ? (
                <div key={turn.id} className="flex items-end" style={{ paddingLeft: SIDE }}>
                  <img
                    data-fx={i === 0 ? '187:1300' : undefined}
                    src={asset.avatarAi}
                    alt=""
                    width={AVATAR}
                    height={AVATAR}
                    className="block shrink-0 self-start"
                  />
                  <div
                    data-fx={i === 0 ? '187:1276' : undefined}
                    className="ml-[18px] rounded-[15px] rounded-tl-none bg-white px-[26px] py-[21px] text-[20px] leading-[30px] text-ink-900 shadow-bubble"
                    style={{ maxWidth: BUBBLE_MAX, wordBreak: 'keep-all' }}
                  >
                    {turn.content}
                  </div>
                  <span
                    data-fx={i === 0 ? '187:1268' : undefined}
                    className="ml-[11px] whitespace-nowrap text-w-sub leading-[30px] text-ink-500"
                  >
                    {time}
                  </span>
                </div>
              ) : (
                <div
                  key={turn.id}
                  className="flex items-end justify-end"
                  style={{ paddingRight: SIDE }}
                >
                  <span className="whitespace-nowrap text-w-sub leading-[30px] text-ink-500">
                    {time}
                  </span>
                  <div
                    className="ml-[10px] rounded-[15px] rounded-tr-none bg-accent px-[26px] py-[21px] text-[20px] leading-[30px] text-white shadow-bubble"
                    style={{ maxWidth: BUBBLE_MAX, wordBreak: 'keep-all' }}
                  >
                    {turn.content}
                  </div>
                  <Avatar
                    src={elder?.photoPath ? photos.data?.[elder.photoPath] : undefined}
                    name={elder?.name ?? '어르신'}
                    size="sm"
                    px={AVATAR}
                    className="ml-[18px] shrink-0 self-start"
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
