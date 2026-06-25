import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Heart, ArrowLeft, Play, BookOpen, MessageSquareHeart, Shirt, Sparkles } from 'lucide-react';
import { useStore } from '../store/store';
import { THERAPY_TYPES, isDefaultAppearance } from '../types';
import { cn, formatRelative } from '../lib/utils';
import { ElderCharacter } from '../components/ElderCharacter';

// /elder — 어르신 모드 진입 (어르신 카드 선택)
// /elder/:elderId — 특정 어르신 홈 (온유 스타일)

export function ElderHomePage() {
  const { elderId } = useParams();

  // 어르신 선택 화면
  if (!elderId) {
    return <ElderPicker />;
  }
  return <ElderHome elderId={elderId} />;
}

function ElderPicker() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-warm-100/40 to-warm-200/30 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-elder-lg font-bold text-warm-900 mb-4" style={{ wordBreak: 'keep-all' }}>
        요양보호사 선생님께
      </div>
      <p className="text-elder-sm text-warm-700 mb-8 max-w-md leading-relaxed" style={{ wordBreak: 'keep-all' }}>
        어르신용 화면은 요양보호사 선생님이 어르신을 선택하시고 세션을 시작해 주세요.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to="/caregiver"
          className="inline-flex items-center gap-2 bg-warm-500 text-white px-6 py-4 rounded-2xl font-bold text-base hover:bg-warm-600 shadow-warm"
        >
          요양보호사 화면으로
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-white border-2 border-warm-300 text-warm-700 px-6 py-4 rounded-2xl font-bold text-base hover:bg-warm-50"
        >
          <ArrowLeft size={18} /> 처음으로
        </Link>
      </div>
    </div>
  );
}

function ElderHome({ elderId }: { elderId: string }) {
  const navigate = useNavigate();
  const elders = useStore((s) => s.elders);
  const sessions = useStore((s) => s.sessions);
  const chronicles = useStore((s) => s.chronicles);
  const logs = useStore((s) => s.logs);
  const startConversation = useStore((s) => s.startConversation);

  const elder = useMemo(() => elders.find((e) => e.id === elderId), [elders, elderId]);
  const eldersSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.elderId === elderId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [sessions, elderId]
  );
  const elderChronicles = useMemo(
    () =>
      chronicles
        .filter((c) => c.elderId === elderId)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [chronicles, elderId]
  );
  const recentLogs = useMemo(
    () =>
      logs
        .filter((l) => l.elderId === elderId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 3),
    [logs, elderId]
  );

  const [showMemoryDialog, setShowMemoryDialog] = useState(false);
  const [tapAnim, setTapAnim] = useState(false);

  if (!elder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100 p-8">
        <div className="text-center">
          <div className="text-elder-base font-bold text-warm-700 mb-4">어르신을 찾을 수 없어요.</div>
          <Link to="/elder" className="inline-block bg-warm-500 text-white text-elder-sm font-bold px-6 py-3 rounded-2xl">
            뒤로 가기
          </Link>
        </div>
      </div>
    );
  }

  function startSession(sessionId: string) {
    const log = startConversation(sessionId, elder!.id);
    navigate(`/elder/converse/${log.id}`);
  }

  const greeting = greetingByTime();
  const nextSession = eldersSessions[0];
  const needsDressUp = isDefaultAppearance(elder.appearance);

  function tapCharacter() {
    setTapAnim(true);
    setTimeout(() => setTapAnim(false), 700);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-warm-100/40 to-warm-200/40 pb-12">
      {/* 상단 */}
      <header className="px-6 sm:px-10 py-4 flex items-center justify-between bg-cream-50/80 backdrop-blur border-b border-warm-200/50">
        <Link to="/caregiver" className="inline-flex items-center gap-2 text-base text-warm-700 hover:text-warm-900 font-semibold">
          <ArrowLeft size={20} /> 끝내기
        </Link>
        <div className="text-elder-sm font-bold text-warm-900">
          {elder.name} 어르신
        </div>
        <div className="w-20" />
      </header>

      <main className="px-6 sm:px-10 py-6 max-w-5xl mx-auto">
        {/* 인사말 */}
        <div className="text-center mb-5 animate-fade-in-up">
          <div className="text-base text-warm-600 mb-1">{greeting.label}</div>
          <h1
            className="text-elder-lg sm:text-elder-xl font-bold text-warm-900 leading-tight"
            style={{ wordBreak: 'keep-all' }}
          >
            {elder.name} 어르신, {greeting.message}
          </h1>
        </div>

        {/* 캐릭터가 기본 상태 — 친구 만들기 안내 */}
        {needsDressUp ? (
          <button
            onClick={() => navigate(`/elder/${elder.id}/dress`)}
            className="group w-full rounded-3xl bg-gradient-to-br from-warm-100 via-rose-100 to-cream-100 shadow-warm border-2 border-warm-300 p-6 sm:p-8 mb-5 transition active:scale-[0.99]"
          >
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="relative shrink-0">
                <div className="rounded-3xl overflow-hidden shadow-warm border-4 border-white animate-breathe">
                  <ElderCharacter appearance={elder.appearance} size={220} speaking={false} />
                </div>
                <div className="absolute -top-3 -right-3 text-3xl animate-gentle-bounce">✨</div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warm-500 text-white text-sm font-bold mb-3">
                  <Sparkles size={14} /> 처음이에요
                </div>
                <h2 className="text-elder-lg font-bold text-warm-900 mb-2 leading-snug" style={{ wordBreak: 'keep-all' }}>
                  먼저 나만의 친구를<br />만들어 볼까요?
                </h2>
                <p className="text-elder-sm text-warm-700 mb-5" style={{ wordBreak: 'keep-all' }}>
                  옷도 입혀주시고, 머리도 골라주세요.
                </p>
                <div className="inline-flex items-center gap-3 bg-warm-500 hover:bg-warm-600 text-white px-7 py-4 rounded-2xl text-elder-sm font-bold shadow-warm transition">
                  <Shirt size={26} />
                  <span>친구 만들기</span>
                </div>
              </div>
            </div>
          </button>
        ) : (
          // 이미 꾸민 상태 — 큰 캐릭터 + 탭하면 꾸미러 가기
          <div className="mb-5">
            <button
              onClick={tapCharacter}
              className="group block w-full active:scale-[0.99] transition"
              aria-label="캐릭터 쓰다듬기"
            >
              <div className="relative rounded-3xl overflow-hidden shadow-warm border-4 border-white">
                <div className={cn('flex items-center justify-center', tapAnim ? 'animate-gentle-bounce' : '')}>
                  <ElderCharacter appearance={elder.appearance} size={340} speaking={tapAnim} />
                </div>
                {tapAnim ? (
                  <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-4xl animate-fade-in-up pointer-events-none">
                    💝
                  </div>
                ) : null}
              </div>
            </button>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
              <div className="text-base text-warm-700/70">
                화면을 누르면 친구가 반겨드려요
              </div>
              <button
                onClick={() => navigate(`/elder/${elder.id}/dress`)}
                className="inline-flex items-center gap-2 text-base font-bold text-warm-700 hover:text-warm-900 bg-white border-2 border-warm-300 px-5 py-2.5 rounded-2xl active:scale-95 transition"
              >
                <Shirt size={18} /> 옷 갈아입히기
              </button>
            </div>
          </div>
        )}

        {/* 메인 — 오늘의 대화 카드 (꾸민 후엔 메인 액션) */}
        {nextSession ? (
          <button
            onClick={() => startSession(nextSession.id)}
            className={cn(
              'group w-full text-left rounded-3xl shadow-warm border-2 border-warm-200 p-6 sm:p-8 mb-5 transition active:scale-[0.99]',
              `bg-gradient-to-br ${THERAPY_TYPES[nextSession.therapyType].gradient}`
            )}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">{THERAPY_TYPES[nextSession.therapyType].emoji}</span>
                  <div className="px-3 py-1 rounded-full bg-white/80 text-warm-800 text-base font-bold">
                    {needsDressUp ? '친구 만든 후 시작' : '오늘의 대화'}
                  </div>
                </div>
                <div
                  className="text-elder-base font-bold text-warm-900 mb-1 leading-snug"
                  style={{ wordBreak: 'keep-all' }}
                >
                  {nextSession.title}
                </div>
                <div className="text-base text-warm-700" style={{ wordBreak: 'keep-all' }}>
                  {THERAPY_TYPES[nextSession.therapyType].description}
                </div>
              </div>
              <div className="inline-flex items-center gap-2 bg-warm-500 text-white px-5 py-3 rounded-2xl text-elder-sm font-bold shadow-soft group-hover:bg-warm-600 transition shrink-0">
                <Play size={24} fill="currentColor" />
                <span>시작</span>
              </div>
            </div>
          </button>
        ) : (
          <div className="rounded-3xl bg-white border-2 border-warm-200 p-6 mb-5 text-center">
            <div className="text-elder-sm text-warm-700">
              요양보호사 선생님께서 곧 활동을 준비해 드릴 거예요.
            </div>
          </div>
        )}

        {/* 작은 카드 — 추억 보기 / 지난 대화 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setShowMemoryDialog(true)}
            className="rounded-2xl bg-white border-2 border-warm-200 p-5 text-left hover:border-warm-400 hover:shadow-soft transition active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                <BookOpen size={24} />
              </div>
              <div className="min-w-0">
                <div className="text-elder-sm font-bold text-warm-900">나의 추억</div>
                <div className="text-base text-warm-600 mt-0.5">
                  이야기 {elderChronicles.length}개
                </div>
              </div>
            </div>
          </button>

          <Link
            to={recentLogs[0] ? `/caregiver/logs/${recentLogs[0].id}` : '#'}
            onClick={(e) => {
              if (!recentLogs[0]) e.preventDefault();
            }}
            className={cn(
              'rounded-2xl bg-white border-2 border-warm-200 p-5 text-left transition active:scale-[0.98]',
              recentLogs[0] ? 'hover:border-warm-400 hover:shadow-soft' : 'opacity-60 cursor-not-allowed'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <MessageSquareHeart size={24} />
              </div>
              <div className="min-w-0">
                <div className="text-elder-sm font-bold text-warm-900">지난 대화</div>
                <div className="text-base text-warm-600 mt-0.5">
                  {recentLogs[0]
                    ? `${formatRelative(recentLogs[0].startedAt)}`
                    : '아직 없어요'}
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* 다른 세션 */}
        {eldersSessions.length > 1 ? (
          <div className="mt-6">
            <h2 className="text-base font-bold text-warm-800 mb-2 px-1">다른 활동</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {eldersSessions.slice(1).map((s) => (
                <button
                  key={s.id}
                  onClick={() => startSession(s.id)}
                  className={cn(
                    'text-left rounded-2xl border-2 p-4 transition active:scale-[0.98]',
                    `bg-gradient-to-br ${THERAPY_TYPES[s.therapyType].gradient}`,
                    'border-warm-200/50 hover:border-warm-400 hover:shadow-soft'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{THERAPY_TYPES[s.therapyType].emoji}</span>
                    <span className="text-elder-sm font-bold text-warm-900">{s.title}</span>
                  </div>
                  <div className="text-base text-warm-700 ml-9" style={{ wordBreak: 'keep-all' }}>
                    {THERAPY_TYPES[s.therapyType].label} · 약 {s.durationMinutes}분
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="text-center mt-10 text-warm-500/60">
          <Heart size={20} className="inline" /> &nbsp;오늘도 행복한 하루 되세요.
        </div>
      </main>

      {showMemoryDialog ? (
        <MemoryDialog
          elderName={elder.name}
          chronicles={elderChronicles}
          onClose={() => setShowMemoryDialog(false)}
        />
      ) : null}
    </div>
  );
}

function MemoryDialog({
  elderName,
  chronicles,
  onClose,
}: {
  elderName: string;
  chronicles: ReturnType<typeof useStore.getState>['chronicles'];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm animate-fade-in-up" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-cream-50 rounded-t-3xl sm:rounded-3xl border border-warm-200 shadow-warm animate-fade-in-up max-h-[88vh] flex flex-col">
        <header className="px-6 py-5 border-b border-warm-200 flex items-center justify-between">
          <div>
            <div className="text-elder-base font-bold text-warm-900">{elderName} 어르신의 추억</div>
            <div className="text-base text-warm-600 mt-0.5">{chronicles.length}개의 이야기</div>
          </div>
          <button
            onClick={onClose}
            className="text-elder-sm font-bold text-warm-700 bg-white border-2 border-warm-300 hover:bg-warm-100 px-5 py-2.5 rounded-2xl"
          >
            닫기
          </button>
        </header>
        <div className="overflow-y-auto p-6 space-y-4">
          {chronicles.length === 0 ? (
            <div className="text-center py-12 text-elder-sm text-warm-700">
              아직 들려주신 이야기가 없어요.<br />오늘 대화를 시작해 보세요.
            </div>
          ) : (
            chronicles.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl border border-warm-200 p-5 shadow-soft">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base font-bold text-warm-700 bg-warm-100 px-2.5 py-0.5 rounded-full">
                    {c.topic}
                  </span>
                  <span className="text-sm text-warm-500 ml-auto">{formatRelative(c.recordedAt)}</span>
                </div>
                <p className="text-elder-sm leading-relaxed text-slate-800" style={{ wordBreak: 'keep-all' }}>
                  {c.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function greetingByTime(): { label: string; message: string } {
  const h = new Date().getHours();
  if (h < 11) return { label: '오늘 아침', message: '안녕히 주무셨어요?' };
  if (h < 14) return { label: '점심 시간', message: '점심은 드셨어요?' };
  if (h < 18) return { label: '오후', message: '오늘은 어떠세요?' };
  return { label: '저녁', message: '오늘 하루 어떠셨어요?' };
}
