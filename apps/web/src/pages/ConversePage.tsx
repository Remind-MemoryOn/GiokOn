import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, type NavigateFunction } from 'react-router-dom';
import { Mic, Square, Volume2, Sparkles, X, RotateCcw, Send, Pencil } from 'lucide-react';
import { useStore } from '../store/store';
import { AI_DISCLOSURE, openConversation, respondToUserTurn } from '../lib/ai';
import {
  cancelSpeak,
  isSttSupported,
  isTtsSupported,
  primeVoices,
  speak,
  startStt,
  type SttHandle,
} from '../lib/speech';
import { cn } from '../lib/utils';
import { EMOTION_META, type ConversationLog } from '../types';
import { ElderCharacter } from '../components/ElderCharacter';

type Phase = 'starting' | 'ai_speaking' | 'mic_ready' | 'listening' | 'processing' | 'ended';

const PHASE_LABEL: Record<Phase, string> = {
  starting:     '준비하고 있어요',
  ai_speaking:  '듣고 계세요',
  mic_ready:    '말씀해 주세요',
  listening:    '듣고 있어요',
  processing:   '잠깐만요',
  ended:        '오늘 대화 잘 하셨어요',
};

export function ConversePage() {
  const { logId = '' } = useParams();
  const navigate = useNavigate();

  const logs = useStore((s) => s.logs);
  const elders = useStore((s) => s.elders);
  const sessions = useStore((s) => s.sessions);
  const allChronicles = useStore((s) => s.chronicles);
  const log = useMemo(() => logs.find((l) => l.id === logId), [logs, logId]);
  const elder = useMemo(
    () => (log ? elders.find((e) => e.id === log.elderId) : undefined),
    [elders, log]
  );
  const session = useMemo(
    () => (log ? sessions.find((s) => s.id === log.sessionId) : undefined),
    [sessions, log]
  );
  const chronicle = useMemo(
    () =>
      log
        ? allChronicles
            .filter((c) => c.elderId === log.elderId)
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        : [],
    [allChronicles, log]
  );
  const appendTurn = useStore((s) => s.appendTurn);
  const endConversation = useStore((s) => s.endConversation);

  const [phase, setPhase] = useState<Phase>(() =>
    log && log.turns.length > 0 ? 'mic_ready' : 'starting'
  );
  const [interim, setInterim] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTextFallback, setShowTextFallback] = useState(!isSttSupported());
  const [textInput, setTextInput] = useState('');
  const [autoSummary, setAutoSummary] = useState<{ count: number; topics: string[] }>({
    count: 0,
    topics: [],
  });
  const [needsTtsUnlock, setNeedsTtsUnlock] = useState(false);
  // 위기·관찰 알림(요양보호사용). 어르신 화면 흐름은 방해하지 않고 상단에 표시.
  const [safetyAlert, setSafetyAlert] = useState<{ level: 'watch' | 'crisis'; message: string } | null>(null);

  const sttRef = useRef<SttHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // 초기화 — 첫 AI 질문 자동 시작 (이미 턴이 있으면 초기 phase가 'mic_ready')
  useEffect(() => {
    if (!log || !elder || !session || startedRef.current) return;
    startedRef.current = true;
    if (log.turns.length === 0) {
      void runOpener();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.id]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [log?.turns.length, interim]);

  async function runOpener() {
    if (!log || !elder || !session) return;
    setPhase('starting');
    await primeVoices();
    const guarded = openConversation(elder, session, chronicle);
    appendTurn(log.id, 'AI', guarded.response.question, guarded.response.topic);
    await playAi(guarded.response.question);
    setPhase('mic_ready');
  }

  async function playAi(text: string) {
    setPhase('ai_speaking');
    if (!isTtsSupported()) return;
    try {
      await speak(text);
    } catch {
      setNeedsTtsUnlock(true);
    }
  }

  function handleUserText(text: string) {
    if (!log || !elder || !session) return;
    if (!text.trim()) return;

    const { addedChronicle } = appendTurn(log.id, 'Elderly', text);

    if (addedChronicle) {
      setAutoSummary((s) => ({
        count: s.count + 1,
        topics: Array.from(new Set([...s.topics, String(addedChronicle.topic)])).slice(-3),
      }));
    }

    setPhase('processing');
    const freshLog = useStore.getState().logs.find((l) => l.id === log.id);
    const guarded = respondToUserTurn(elder, session, freshLog?.turns || [], text);

    // 위기·관찰 알림은 요양보호사가 보도록 상단에 유지한다(어르신 흐름은 방해 없음).
    if (guarded.caregiverAlert && guarded.event) {
      setSafetyAlert({ level: guarded.event.level, message: guarded.caregiverAlert });
    }

    appendTurn(log.id, 'AI', guarded.response.question, guarded.response.topic);
    void playAi(guarded.response.question).then(() => {
      // 위기·중단 요청·반복 거부·긴 침묵 → 안전 응답을 들려준 뒤 따뜻하게 마무리한다.
      if (guarded.session.recommendation === 'end_session') {
        if (log) endConversation(log.id);
        setPhase('ended');
        return;
      }
      setPhase('mic_ready');
    });
  }

  function startListening() {
    setErrorMsg(null);
    setInterim('');
    if (!isSttSupported()) {
      setShowTextFallback(true);
      return;
    }
    setPhase('listening');
    sttRef.current = startStt({
      onPartial: (t) => setInterim(t),
      onFinal: (t) => {
        setInterim('');
        handleUserText(t);
      },
      onError: (err) => {
        setErrorMsg(err);
        setPhase('mic_ready');
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setShowTextFallback(true);
        }
      },
      onEnd: () => {
        sttRef.current = null;
        setPhase((p) => (p === 'listening' ? 'mic_ready' : p));
      },
    });
  }

  function stopListening() {
    sttRef.current?.stop();
  }

  function submitTextFallback() {
    if (!textInput.trim()) return;
    const t = textInput.trim();
    setTextInput('');
    handleUserText(t);
  }

  function endNow() {
    cancelSpeak();
    sttRef.current?.abort();
    if (log) endConversation(log.id);
    setPhase('ended');
  }


  const turns = useMemo(() => log?.turns ?? [], [log?.turns]);
  const lastAi = useMemo(() => [...turns].reverse().find((t) => t.speaker === 'AI'), [turns]);
  const lastElderly = useMemo(
    () => [...turns].reverse().find((t) => t.speaker === 'Elderly'),
    [turns]
  );

  if (!log || !elder || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-cream-100">
        <div className="text-center">
          <div className="text-elder-lg font-semibold mb-4 text-warm-700">
            세션을 찾을 수 없습니다.
          </div>
          <button
            onClick={() => navigate('/elder')}
            className="text-elder-sm bg-warm-500 text-white px-8 py-4 rounded-2xl hover:bg-warm-600"
          >
            처음으로
          </button>
        </div>
      </div>
    );
  }

  const micState =
    phase === 'listening' ? 'recording'
    : phase === 'ai_speaking' || phase === 'starting' || phase === 'processing' ? 'disabled'
    : 'idle';

  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-br from-warm-200/60 via-warm-100/40 to-cream-100 text-slate-800"
      style={{ fontSize: '20px' }}
    >
      {/* 데스크톱에서 시연할 때 태블릿처럼 가운데 정렬 */}
      <div className="hidden xl:block fixed top-4 right-4 z-10 text-xs text-warm-700 bg-white/80 backdrop-blur px-3 py-1.5 rounded-full border border-warm-200 shadow-soft pointer-events-none">
        💡 실제 시연 시 태블릿 가로 모드 권장
      </div>
      {/* 상단 — 단순하게: 어르신 이름 + 종료 */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between bg-cream-50/80 backdrop-blur-sm border-b border-warm-200/60">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-slate-900 text-lg shrink-0 shadow-soft"
            style={{ background: elder.avatarColor }}
          >
            {elder.name.slice(-2)}
          </div>
          <div>
            <div className="text-elder-sm font-bold text-warm-800 leading-tight">
              {elder.name} 어르신
            </div>
            <div className="text-base text-warm-600">{session.title}</div>
            {/* AI 이용 사전 고지(AI기본법 투명성) */}
            <div className="text-xs text-warm-500 mt-0.5">{AI_DISCLOSURE}</div>
          </div>
        </div>
        <button
          onClick={endNow}
          disabled={phase === 'ended'}
          className="flex items-center gap-2 text-elder-sm font-semibold text-warm-700 bg-white hover:bg-warm-50 active:bg-warm-100 disabled:opacity-40 px-5 py-3 rounded-2xl border-2 border-warm-300 transition shadow-soft"
        >
          <X size={22} />
          <span>종료</span>
        </button>
      </header>

      {/* 위기·관찰 알림 — 요양보호사용(기기를 확인하는 보호자·직원에게 노출) */}
      {safetyAlert ? (
        <div className="px-6 sm:px-10 pt-4" role="alert" aria-live="assertive">
          <div
            className={cn(
              'rounded-2xl px-5 py-4 flex items-start gap-3 text-base shadow-soft border-2',
              safetyAlert.level === 'crisis'
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            )}
          >
            <span className="font-bold shrink-0">
              {safetyAlert.level === 'crisis' ? '요양보호사 확인 필요' : '살펴봐 주세요'}
            </span>
            <span className="leading-relaxed">{safetyAlert.message}</span>
            <button
              onClick={() => setSafetyAlert(null)}
              className="ml-auto shrink-0 font-semibold underline underline-offset-2"
            >
              확인했어요
            </button>
          </div>
        </div>
      ) : null}

      {/* 자동 축적 안내 — 어르신에겐 보이지 않지만 시연 시 효과 */}
      {autoSummary.count > 0 ? (
        <div className="px-6 sm:px-10 pt-4">
          <div className="rounded-2xl bg-white border-2 border-warm-200 px-5 py-3 flex items-center gap-3 text-base shadow-soft">
            <Sparkles size={20} className="text-warm-500 shrink-0" />
            <span className="text-warm-800">
              방금 대화에서 새로운 추억을 <strong className="text-warm-600 tabular-nums">{autoSummary.count}</strong>개 알게 되었어요
              {autoSummary.topics.length > 0 ? (
                <span className="text-warm-500"> · {autoSummary.topics.join(' · ')}</span>
              ) : null}
            </span>
          </div>
        </div>
      ) : null}

      {/* 메인 — 캐릭터 + 대화 좌우 분할 */}
      <main
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 sm:py-8"
      >
        <div className="max-w-6xl mx-auto w-full">
          {phase === 'starting' ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="rounded-3xl overflow-hidden shadow-warm border-4 border-white">
                <ElderCharacter appearance={elder.appearance} size={260} speaking={false} />
              </div>
              <div className="text-elder-base text-warm-700 font-semibold mt-2">
                대화를 준비하고 있어요...
              </div>
            </div>
          ) : phase === 'ended' ? (
            <EndedView log={log} elder={elder} navigate={navigate} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-5 sm:gap-7 items-start">
              {/* 캐릭터 — 왼쪽 (또는 위) */}
              <div className="md:col-span-2 flex flex-col items-center md:sticky md:top-4">
                <div className="rounded-3xl overflow-hidden shadow-warm border-4 border-white">
                  <ElderCharacter
                    appearance={elder.appearance}
                    size={260}
                    speaking={phase === 'ai_speaking'}
                  />
                </div>
                <div className="mt-3 text-center">
                  <div className="text-base text-warm-600">{elder.name} 어르신의 친구</div>
                </div>
              </div>

              {/* 대화 — 오른쪽 */}
              <div className="md:col-span-3 space-y-4">
                {/* AI 가장 최근 질문 — 메인 표시 */}
                {lastAi ? (
                  <div
                    key={lastAi.id}
                    className="bg-white rounded-3xl shadow-warm p-6 sm:p-8 animate-fade-in-up border border-warm-100"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-elder-sm text-warm-600 font-semibold">친구가 묻습니다</div>
                      {phase === 'ai_speaking' ? (
                        <div className="flex items-center gap-1.5 ml-auto text-warm-500">
                          <Volume2 size={18} className="animate-gentle-bounce" />
                          <span className="text-sm font-semibold">읽어드리고 있어요</span>
                        </div>
                      ) : null}
                    </div>
                    <p
                      className="text-elder-base sm:text-elder-lg font-medium text-slate-900 leading-relaxed"
                      style={{ wordBreak: 'keep-all' }}
                    >
                      {lastAi.text}
                    </p>
                  </div>
                ) : null}

                {/* 어르신 가장 최근 답변 — 아래 */}
                {lastElderly ? (
                  <div
                    key={lastElderly.id}
                    className="bg-warm-500 text-white rounded-3xl p-5 sm:p-6 ml-auto max-w-[92%] animate-fade-in-up shadow-soft"
                  >
                    <div className="text-sm font-semibold opacity-80 mb-1.5">방금 하신 말씀</div>
                    <p
                      className="text-elder-base font-medium leading-relaxed"
                      style={{ wordBreak: 'keep-all' }}
                    >
                      {lastElderly.text}
                    </p>
                  </div>
                ) : null}

                {/* 실시간 인식 중 */}
                {interim ? (
                  <div className="bg-warm-300/50 text-warm-900 rounded-3xl p-5 sm:p-6 ml-auto max-w-[92%] animate-fade-in-up shadow-soft">
                    <div className="text-sm font-semibold opacity-70 mb-1.5">듣고 있어요</div>
                    <p
                      className="text-elder-base italic leading-relaxed"
                      style={{ wordBreak: 'keep-all' }}
                    >
                      {interim}
                    </p>
                  </div>
                ) : null}

                {/* 안 보일 때 안내 메시지 */}
                {!lastAi ? (
                  <div className="text-center py-16 text-elder-base text-warm-700 font-semibold">
                    대화가 곧 시작됩니다.
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 하단 — 마이크 중심의 단순한 컨트롤 */}
      {phase !== 'ended' ? (
        <footer className="border-t-2 border-warm-200/70 bg-cream-50/95 backdrop-blur-sm px-6 sm:px-10 pt-6 pb-8 sm:pb-10">
          <div className="max-w-3xl mx-auto">
            {/* 상태 라벨 — 부드러운 한국어 */}
            <div className="text-center mb-5">
              <span
                className={cn(
                  'inline-flex items-center gap-2 px-5 py-2 rounded-full text-elder-sm font-bold',
                  phase === 'listening'
                    ? 'bg-red-50 text-red-700 border-2 border-red-200'
                    : phase === 'processing'
                    ? 'bg-amber-50 text-amber-700 border-2 border-amber-200'
                    : phase === 'mic_ready'
                    ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
                    : 'bg-warm-100 text-warm-700 border-2 border-warm-200'
                )}
              >
                {phase === 'listening' ? (
                  <span className="relative flex w-3 h-3">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-red-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full w-3 h-3 bg-red-500" />
                  </span>
                ) : phase === 'ai_speaking' || phase === 'starting' ? (
                  <Volume2 size={20} />
                ) : null}
                {PHASE_LABEL[phase]}
              </span>
            </div>

            {errorMsg && errorMsg !== 'aborted' ? (
              <div className="text-center text-base text-red-600 font-semibold mb-4">
                다시 한 번 천천히 말씀해 주세요.
              </div>
            ) : null}

            {needsTtsUnlock ? (
              <div className="text-center mb-4">
                <button
                  onClick={async () => {
                    setNeedsTtsUnlock(false);
                    if (lastAi) await playAi(lastAi.text);
                    setPhase('mic_ready');
                  }}
                  className="inline-flex items-center gap-2 text-elder-sm font-semibold bg-warm-500 hover:bg-warm-600 text-white px-6 py-3 rounded-2xl shadow-soft"
                >
                  <Volume2 size={22} /> 다시 들려드릴게요
                </button>
              </div>
            ) : null}

            {showTextFallback ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitTextFallback();
                    }}
                    placeholder="여기에 답을 적어주세요..."
                    disabled={phase === 'ai_speaking' || phase === 'processing'}
                    className="flex-1 h-20 px-5 rounded-3xl border-2 border-warm-300 bg-white text-elder-base focus:outline-none focus:ring-4 focus:ring-warm-300/40 focus:border-warm-500 disabled:opacity-50"
                  />
                  <button
                    onClick={submitTextFallback}
                    disabled={!textInput.trim() || phase === 'ai_speaking' || phase === 'processing'}
                    className="h-20 w-20 rounded-3xl bg-warm-500 hover:bg-warm-600 disabled:opacity-40 text-white flex items-center justify-center shadow-warm transition"
                  >
                    <Send size={28} />
                  </button>
                </div>
                {isSttSupported() ? (
                  <button
                    onClick={() => setShowTextFallback(false)}
                    className="text-base text-warm-600 hover:text-warm-800 font-semibold mt-1"
                  >
                    <Mic size={16} className="inline mr-1 -mt-0.5" />
                    음성으로 말하기
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                {/* 큰 마이크 버튼 */}
                <button
                  onClick={() => {
                    if (phase === 'listening') stopListening();
                    else if (phase === 'mic_ready') startListening();
                  }}
                  disabled={micState === 'disabled'}
                  className={cn(
                    'relative rounded-full flex items-center justify-center transition select-none',
                    'w-mic-sm h-mic-sm sm:w-mic sm:h-mic',
                    'shadow-mic disabled:shadow-soft disabled:opacity-50 disabled:cursor-not-allowed',
                    micState === 'recording'
                      ? 'bg-red-500 hover:bg-red-600 active:scale-95'
                      : 'bg-warm-500 hover:bg-warm-600 active:scale-95'
                  )}
                  aria-label={micState === 'recording' ? '말하기 멈추기' : '말하기 시작'}
                >
                  {micState === 'recording' ? (
                    <>
                      <span className="absolute inset-0 rounded-full bg-red-400 animate-pulse-ring" />
                      <span className="absolute inset-3 rounded-full bg-red-500/40 animate-breathe" />
                      <Square size={56} fill="currentColor" className="text-white relative" />
                    </>
                  ) : (
                    <Mic size={64} className="text-white" />
                  )}
                </button>

                <div className="text-elder-sm font-bold text-warm-800">
                  {phase === 'listening' ? '다 말씀하시면 버튼을 다시 눌러주세요' :
                   phase === 'mic_ready' ? '버튼을 누르고 말씀해 주세요' :
                   ''}
                </div>

                <div className="flex items-center gap-6 mt-1">
                  {lastAi ? (
                    <button
                      onClick={() => playAi(lastAi.text).then(() => setPhase('mic_ready'))}
                      disabled={phase === 'ai_speaking' || phase === 'listening' || phase === 'processing'}
                      className="flex items-center gap-2 text-base text-warm-700 hover:text-warm-900 font-semibold disabled:opacity-40"
                    >
                      <RotateCcw size={18} />
                      다시 들려주세요
                    </button>
                  ) : null}
                  <button
                    onClick={() => setShowTextFallback(true)}
                    className="flex items-center gap-2 text-base text-warm-700 hover:text-warm-900 font-semibold"
                  >
                    <Pencil size={18} />
                    글로 답하기
                  </button>
                </div>
              </div>
            )}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

function EndedView({
  log,
  elder,
  navigate,
}: {
  log: ConversationLog;
  elder: import('../types').ElderProfile;
  navigate: NavigateFunction;
}) {
  // store에서 최신 log 가져와서 guardianReport 사용
  const fresh = useStore((s) => s.logs.find((l) => l.id === log.id)) || log;
  const report = fresh.guardianReport;
  const meta = report ? EMOTION_META[report.emotionTone] : null;

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-5 animate-fade-in-up">
      <div className="rounded-3xl overflow-hidden shadow-warm border-4 border-white">
        <ElderCharacter appearance={elder.appearance} size={200} speaking={false} expression="happy" />
      </div>
      <div
        className="text-elder-xl font-bold text-warm-800 text-center leading-snug"
        style={{ wordBreak: 'keep-all' }}
      >
        오늘 이야기<br />잘 들었어요.
      </div>
      <div className="text-elder-sm text-warm-600 text-center">
        고맙습니다.
      </div>

      {/* 요양보호사 시연용 — AI 자동 요약 */}
      {report ? (
        <div className="w-full max-w-xl rounded-3xl bg-white border-2 border-warm-200 shadow-soft p-6 mt-2 text-left animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-warm-500" />
            <div className="text-sm font-bold text-warm-700">AI 자동 요약 · 보호자에게 전달됩니다</div>
            {meta ? (
              <span
                className={cn(
                  'ml-auto text-xs font-bold px-2.5 py-1 rounded-full border',
                  meta.color
                )}
              >
                {meta.emoji} {meta.label}
              </span>
            ) : null}
          </div>
          <div className="text-base font-bold text-slate-900 mb-1.5" style={{ wordBreak: 'keep-all' }}>
            {report.headline}
          </div>
          <div className="text-sm text-slate-600 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
            {report.body}
          </div>
          {report.highlightTopics.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {report.highlightTopics.map((t) => (
                <span key={t} className="text-xs bg-warm-100 text-warm-800 px-2 py-0.5 rounded-full">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-3 mt-2">
        <button
          onClick={() => navigate(`/elder/${elder.id}`)}
          className="text-elder-sm font-bold bg-warm-500 hover:bg-warm-600 text-white px-8 py-4 rounded-2xl shadow-warm transition"
        >
          처음으로
        </button>
      </div>
    </div>
  );
}
