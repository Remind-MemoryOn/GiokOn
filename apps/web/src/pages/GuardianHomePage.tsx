import { useMemo, useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import {
  MessageCircle, LogOut, Heart, BookOpen, Sparkles, Phone, Lightbulb,
  ChevronRight, Calendar, TrendingUp,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ElderCharacter } from '../components/ElderCharacter';
import { useStore } from '../store/store';
import {
  EMOTION_META,
  type ConversationLog,
  type EmotionTone,
  type GuardianReport,
} from '../types';
import { cn, formatKoreanDateTime, formatRelative } from '../lib/utils';

type Tab = 'home' | 'reports' | 'profile' | 'guide';

export function GuardianHomePage() {
  const navigate = useNavigate();
  const guardianAuth = useStore((s) => s.guardianAuth);
  const guardianLogout = useStore((s) => s.guardianLogout);
  const elders = useStore((s) => s.elders);
  const allLogs = useStore((s) => s.logs);
  const allChronicles = useStore((s) => s.chronicles);

  const [tab, setTab] = useState<Tab>('home');

  const elder = guardianAuth
    ? elders.find((e) => e.id === guardianAuth.elderId)
    : undefined;

  // Hooks는 조건부 반환보다 먼저 호출해야 한다(rules-of-hooks)
  const elderLogs = useMemo(
    () =>
      elder
        ? allLogs
            .filter((l) => l.elderId === elder.id && l.status === 'ended')
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        : [],
    [allLogs, elder]
  );
  const elderChronicles = useMemo(
    () =>
      elder
        ? allChronicles
            .filter((c) => c.elderId === elder.id)
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        : [],
    [allChronicles, elder]
  );

  if (!guardianAuth) {
    return <Navigate to="/guardian/login" replace />;
  }
  if (!elder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-violet-50 p-8 text-center">
        <div>
          <div className="font-bold mb-3">어르신 정보가 없습니다.</div>
          <Link to="/guardian/login" className="text-violet-600 underline">
            다시 로그인하기
          </Link>
        </div>
      </div>
    );
  }

  const latestLog = elderLogs[0];
  const latestReport = latestLog?.guardianReport;

  const relation = elder.guardian?.relation || '부모님';
  const calling =
    elder.guardian?.relation === '아들' || elder.guardian?.relation === '딸'
      ? elder.name === '이순자' || elder.name === '김복례'
        ? '어머님'
        : '아버님'
      : `${elder.name} 어르신`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-rose-50 to-cream-100 pb-12">
      {/* 상단 */}
      <header className="px-6 sm:px-10 py-4 flex items-center justify-between bg-white/70 backdrop-blur border-b border-violet-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-500 text-white flex items-center justify-center">
            <MessageCircle size={20} />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">기억온 · 보호자</div>
            <div className="text-xs text-slate-500">
              {guardianAuth.guardianName} 님 · {elder.name} 어르신의 {relation}
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            guardianLogout();
            navigate('/');
          }}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium"
        >
          <LogOut size={16} /> 로그아웃
        </button>
      </header>

      {/* 탭 */}
      <nav className="px-6 sm:px-10 pt-5">
        <div className="max-w-4xl mx-auto flex gap-1 bg-white/60 rounded-2xl p-1 border border-violet-100">
          {[
            { id: 'home',     label: '홈',         icon: Heart },
            { id: 'reports',  label: '대화 기록',  icon: BookOpen },
            { id: 'profile',  label: '부모님',     icon: Sparkles },
            { id: 'guide',    label: '대화 가이드', icon: Lightbulb },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition',
                tab === t.id
                  ? 'bg-violet-500 text-white shadow-soft'
                  : 'text-slate-600 hover:bg-white'
              )}
            >
              <t.icon size={15} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="px-6 sm:px-10 py-6 max-w-4xl mx-auto space-y-5">
        {tab === 'home' ? (
          <HomeTab
            elder={elder}
            calling={calling}
            latestReport={latestReport}
            latestLog={latestLog}
            totalSessions={elderLogs.length}
            totalMemories={elderChronicles.length}
            allLogs={elderLogs}
            onJumpToTab={(t) => setTab(t)}
          />
        ) : null}
        {tab === 'reports' ? (
          <ReportsTab logs={elderLogs} elder={elder} />
        ) : null}
        {tab === 'profile' ? (
          <ProfileTab elder={elder} chronicles={elderChronicles} />
        ) : null}
        {tab === 'guide' ? (
          <GuideTab elder={elder} chronicles={elderChronicles} logs={elderLogs} />
        ) : null}
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 홈 탭
// ──────────────────────────────────────────────────────────────
function HomeTab({
  elder,
  calling,
  latestReport,
  latestLog,
  totalSessions,
  totalMemories,
  allLogs,
  onJumpToTab,
}: {
  elder: ReturnType<typeof useStore.getState>['elders'][number];
  calling: string;
  latestReport?: GuardianReport;
  latestLog?: ConversationLog;
  totalSessions: number;
  totalMemories: number;
  allLogs: ConversationLog[];
  onJumpToTab: (t: Tab) => void;
}) {
  // 감정 추이 — 최근 5개 세션
  const recentEmotions = allLogs
    .slice(0, 5)
    .map((l) => l.guardianReport?.emotionTone)
    .filter((x): x is EmotionTone => !!x)
    .reverse();

  return (
    <>
      {/* 인사 + 캐릭터 */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-violet-100 via-rose-100 to-cream-100 px-6 py-5 flex items-center gap-5">
          <div className="rounded-2xl overflow-hidden shadow-soft border-2 border-white shrink-0">
            <ElderCharacter appearance={elder.appearance} size={110} />
          </div>
          <div className="flex-1">
            <div className="text-sm text-violet-700">오늘의 {calling}</div>
            <div className="text-lg sm:text-xl font-bold text-slate-900 leading-snug mt-0.5">
              {latestReport
                ? latestReport.headline
                : `아직 ${calling}의 대화 기록이 없어요.`}
            </div>
            {latestLog ? (
              <div className="text-xs text-slate-500 mt-1.5">
                {formatRelative(latestLog.startedAt)} · {latestLog.turns.length}턴
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* 최신 리포트 미리보기 */}
      {latestReport ? (
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-violet-500" />
              <div className="text-sm font-bold text-slate-900">오늘의 마음</div>
              <span
                className={cn(
                  'ml-auto text-xs font-bold px-2.5 py-1 rounded-full border',
                  EMOTION_META[latestReport.emotionTone].color
                )}
              >
                {EMOTION_META[latestReport.emotionTone].emoji}{' '}
                {EMOTION_META[latestReport.emotionTone].label}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
              {latestReport.body}
            </p>
            {latestReport.highlightTopics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {latestReport.highlightTopics.map((t) => (
                  <Badge key={t} tone="info">
                    #{t}
                  </Badge>
                ))}
              </div>
            ) : null}
            <button
              onClick={() => onJumpToTab('guide')}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-900"
            >
              <Lightbulb size={14} /> 통화 시 이런 이야기 꺼내보세요
              <ChevronRight size={14} />
            </button>
          </div>
        </Card>
      ) : null}

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="총 대화" value={totalSessions} icon={MessageCircle} color="text-violet-600 bg-violet-50" />
        <StatCard label="이야기" value={totalMemories} icon={BookOpen} color="text-rose-600 bg-rose-50" />
        <StatCard
          label="최근 분위기"
          value={recentEmotions[recentEmotions.length - 1] ? EMOTION_META[recentEmotions[recentEmotions.length - 1]].label : '—'}
          icon={Heart}
          color="text-amber-600 bg-amber-50"
        />
      </div>

      {/* 감정 추이 */}
      {recentEmotions.length > 0 ? (
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-slate-500" />
              <div className="text-sm font-bold text-slate-900">최근 분위기 흐름</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {recentEmotions.map((e, i) => {
                const m = EMOTION_META[e];
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold',
                        m.color
                      )}
                    >
                      <span>{m.emoji}</span> {m.label}
                    </div>
                    {i < recentEmotions.length - 1 ? (
                      <ChevronRight size={12} className="text-slate-300" />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-slate-500 mt-3">
              오래된 대화 → 최근 순으로 표시
            </div>
          </div>
        </Card>
      ) : null}

      {/* CTA — 부모님께 안부 전화 */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-warm-100 to-rose-100 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white text-warm-600 flex items-center justify-center shadow-soft shrink-0">
            <Phone size={22} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-900">오늘 {calling}께 전화해보세요</div>
            <div className="text-xs text-slate-600 mt-0.5">
              대화 가이드 탭에서 어떤 이야기 꺼낼지 미리 볼 수 있어요.
            </div>
          </div>
          <button
            onClick={() => onJumpToTab('guide')}
            className="text-xs font-bold bg-warm-500 hover:bg-warm-600 text-white px-4 py-2 rounded-xl shrink-0"
          >
            보기
          </button>
        </div>
      </Card>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// 대화 기록 탭
// ──────────────────────────────────────────────────────────────
function ReportsTab({
  logs,
  elder,
}: {
  logs: ConversationLog[];
  elder: ReturnType<typeof useStore.getState>['elders'][number];
}) {
  if (logs.length === 0) {
    return (
      <Card>
        <div className="py-16 text-center text-sm text-slate-500">
          아직 종료된 대화 기록이 없습니다.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((l) => {
        const r = l.guardianReport;
        if (!r) return null;
        const meta = EMOTION_META[r.emotionTone];
        return (
          <Card key={l.id}>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={14} className="text-slate-400" />
                <div className="text-xs text-slate-600">{formatKoreanDateTime(l.startedAt)}</div>
                <span
                  className={cn(
                    'ml-auto text-xs font-bold px-2 py-0.5 rounded-full border',
                    meta.color
                  )}
                >
                  {meta.emoji} {meta.label}
                </span>
              </div>
              <div className="text-base font-bold text-slate-900 mb-1.5" style={{ wordBreak: 'keep-all' }}>
                {r.headline}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
                {r.body}
              </p>
              {r.highlightTopics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {r.highlightTopics.map((t) => (
                    <Badge key={t} tone="info">#{t}</Badge>
                  ))}
                </div>
              ) : null}

              {/* 대화 일부 */}
              {l.turns.length > 0 ? (
                <details className="mt-4 border-t border-slate-100 pt-3">
                  <summary className="text-xs font-semibold text-slate-600 cursor-pointer">
                    대화 일부 보기 ({l.turns.length}턴)
                  </summary>
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {l.turns.slice(0, 8).map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          'rounded-lg p-2.5 text-xs leading-relaxed',
                          t.speaker === 'AI'
                            ? 'bg-slate-50 text-slate-700'
                            : 'bg-violet-50 text-slate-900 ml-6'
                        )}
                      >
                        <div className="text-[10px] font-bold opacity-70 mb-0.5">
                          {t.speaker === 'AI' ? 'AI' : `${elder.name} 어르신`}
                        </div>
                        {t.text}
                      </div>
                    ))}
                    {l.turns.length > 8 ? (
                      <div className="text-center text-[10px] text-slate-400">
                        ... 그 외 {l.turns.length - 8}턴
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 부모님 특성 탭 (연대기)
// ──────────────────────────────────────────────────────────────
function ProfileTab({
  elder,
  chronicles,
}: {
  elder: ReturnType<typeof useStore.getState>['elders'][number];
  chronicles: ReturnType<typeof useStore.getState>['chronicles'];
}) {
  // 주제별 그룹
  const byTopic = useMemo(() => {
    const map = new Map<string, typeof chronicles>();
    for (const c of chronicles) {
      if (!map.has(c.topic)) map.set(c.topic, []);
      map.get(c.topic)!.push(c);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [chronicles]);

  return (
    <div className="space-y-4">
      {/* 기본 정보 */}
      <Card>
        <div className="p-5 flex items-start gap-5">
          <div className="rounded-2xl overflow-hidden shadow-soft border border-slate-200 shrink-0">
            <ElderCharacter appearance={elder.appearance} size={120} />
          </div>
          <div className="flex-1 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-400 mb-0.5">이름</div>
              <div className="font-semibold text-slate-900">{elder.name}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-0.5">출생</div>
              <div className="text-slate-800">{elder.birthYear}년 ({new Date().getFullYear() - elder.birthYear}세)</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-slate-400 mb-0.5">고향</div>
              <div className="text-slate-800">{elder.hometown || '—'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-slate-400 mb-0.5">젊은 시절</div>
              <div className="text-slate-800">{elder.job || '—'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-slate-400 mb-0.5">가족</div>
              <div className="text-slate-800">{elder.family || '—'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-slate-400 mb-0.5">취미</div>
              <div className="text-slate-800">{elder.hobbies || '—'}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* 주제별 연대기 */}
      {byTopic.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-sm text-slate-500">
            아직 모인 추억이 없습니다. 대화를 시작하면 AI가 차곡차곡 모아드릴게요.
          </div>
        </Card>
      ) : (
        byTopic.map(([topic, entries]) => (
          <Card key={topic}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone="brand">{topic}</Badge>
                <div className="text-sm font-semibold text-slate-900">
                  이야기 {entries.length}개
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {entries.map((c) => (
                <div key={c.id} className="px-5 py-3.5">
                  <p className="text-sm text-slate-800 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
                    {c.content}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-slate-400">
                      {c.source === 'AI' ? '✨ 대화에서' : '🖊 요양보호사 등록'} · {formatRelative(c.recordedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 대화 가이드 탭 — 부모님과 통화/방문 시 참고
// ──────────────────────────────────────────────────────────────
function GuideTab({
  elder,
  logs,
}: {
  elder: ReturnType<typeof useStore.getState>['elders'][number];
  chronicles: ReturnType<typeof useStore.getState>['chronicles'];
  logs: ConversationLog[];
}) {
  const latest = logs[0];
  const latestReport = latest?.guardianReport;

  // 자주 언급된 주제 — 최근 3개 세션 합산
  const topTopics = useMemo(() => {
    const count = new Map<string, number>();
    for (const l of logs.slice(0, 3)) {
      for (const t of l.guardianReport?.highlightTopics || []) {
        count.set(t, (count.get(t) || 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [logs]);

  // 최근 발화 중 인상깊은 한 줄
  const recentElderlyQuotes = useMemo(() => {
    return logs
      .slice(0, 3)
      .flatMap((l) => l.turns.filter((t) => t.speaker === 'Elderly' && t.text.length > 10).slice(0, 2))
      .slice(0, 3);
  }, [logs]);

  const calling =
    elder.guardian?.relation === '아들' || elder.guardian?.relation === '딸'
      ? '어머님' // 또는 아버님 - 시연용 단순화
      : `${elder.name} 어르신`;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-violet-100 to-rose-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={18} className="text-violet-600" />
            <div className="text-sm font-bold text-slate-900">통화 · 방문 시 참고하세요</div>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
            오늘 {calling}께서 어떤 이야기를 즐겁게 하셨는지 미리 알고 가시면, 자연스럽게 그 화제를 꺼내실 수 있어요.
          </p>
        </div>
      </Card>

      {/* 1. 오늘 어떤 마음이세요 */}
      {latestReport ? (
        <Card>
          <div className="p-5">
            <div className="text-xs font-bold text-violet-700 mb-2 flex items-center gap-1.5">
              <Heart size={12} fill="currentColor" /> 오늘 마음 상태
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-bold',
                  EMOTION_META[latestReport.emotionTone].color
                )}
              >
                {EMOTION_META[latestReport.emotionTone].emoji}{' '}
                {EMOTION_META[latestReport.emotionTone].label}
              </span>
              <div className="text-xs text-slate-500">
                {latest ? formatRelative(latest.startedAt) : ''} 대화 기준
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
              {latestReport.body}
            </p>
          </div>
        </Card>
      ) : null}

      {/* 2. 꺼내볼 만한 화제 */}
      {topTopics.length > 0 ? (
        <Card>
          <div className="p-5">
            <div className="text-xs font-bold text-violet-700 mb-3 flex items-center gap-1.5">
              💬 이런 이야기를 꺼내보세요
            </div>
            <div className="space-y-2">
              {topTopics.slice(0, 4).map((t) => (
                <div
                  key={t}
                  className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-sm"
                >
                  <div className="font-bold text-violet-900 mb-1">"{t}" 이야기</div>
                  <div className="text-xs text-violet-700">
                    {guideForTopic(t, elder)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {/* 3. 최근 한 말씀 */}
      {recentElderlyQuotes.length > 0 ? (
        <Card>
          <div className="p-5">
            <div className="text-xs font-bold text-violet-700 mb-3 flex items-center gap-1.5">
              📝 최근에 이렇게 말씀하셨어요
            </div>
            <div className="space-y-2">
              {recentElderlyQuotes.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900"
                  style={{ wordBreak: 'keep-all' }}
                >
                  "{t.text}"
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {/* 4. 피해야 할 화제 */}
      <Card>
        <div className="p-5">
          <div className="text-xs font-bold text-violet-700 mb-3 flex items-center gap-1.5">
            ⚠️ 이런 이야기는 조심해 주세요
          </div>
          <p className="text-sm text-slate-700 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
            돌아가신 분이나 아픈 기억, 슬픈 일은 먼저 꺼내지 않으시는 게 좋아요. {calling}께서 먼저 이야기하시면 잘 들어드리는 것만으로 충분합니다.
          </p>
        </div>
      </Card>

      {/* 5. 따뜻한 문장 추천 */}
      <Card>
        <div className="p-5">
          <div className="text-xs font-bold text-violet-700 mb-3 flex items-center gap-1.5">
            💝 시작할 때 이렇게 말해보세요
          </div>
          <div className="space-y-2">
            {[
              `"${calling}, 오늘 어떠셨어요? 기억온 친구랑 잘 지내셨다고 들었어요."`,
              `"${topTopics[0] ? topTopics[0] + ' 이야기' : '옛날 이야기'} 들으니까 저도 생각났어요. 한번 들려주세요."`,
              `"오늘 점심 뭐 드셨어요? ${elder.hometown ? elder.hometown + ' 음식이 그리우시진 않아요?' : ''}"`,
            ].map((q, i) => (
              <div
                key={i}
                className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-sm text-rose-900 leading-relaxed"
                style={{ wordBreak: 'keep-all' }}
              >
                {q}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function guideForTopic(topic: string, elder: ReturnType<typeof useStore.getState>['elders'][number]): string {
  const map: Record<string, string> = {
    고향:    `${elder.hometown || '고향'}에 대해 자주 그리워하세요. 그 동네 풍경이나 음식 이야기를 꺼내보세요.`,
    가족:    `가족 이야기를 좋아하세요. 자녀나 손주 이야기를 가볍게 물어보세요.`,
    직업:    `${elder.job ? elder.job + ' 시절을' : '젊은 시절 일을'} 자랑스러워하세요. 그때 가장 보람된 순간을 물어보세요.`,
    취미:    `${elder.hobbies || '취미'} 활동에 관심이 있으세요. 요즘에도 하시는지 물어보세요.`,
    음식:    `옛 음식을 그리워하세요. 어머니가 해주시던 음식 이야기를 함께 나눠보세요.`,
    '학창 시절': `학교 친구 이야기를 꺼내실 때 표정이 밝아져요. 누가 가장 친했는지 물어보세요.`,
    음악:    `옛 노래를 좋아하세요. 즐겨 부르시던 곡을 같이 떠올려 보세요.`,
  };
  return map[topic] || `최근에 이 주제로 즐겁게 이야기 나누셨어요. 자연스럽게 꺼내보세요.`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof Heart;
  color: string;
}) {
  return (
    <Card>
      <div className="p-4 flex items-center gap-3">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', color)}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}
