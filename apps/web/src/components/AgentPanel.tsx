// AI 에이전트 패널 (SCR-W11 — T18.2 / Phase W6, mock provider)
//
// 작업 지향 대화형 도우미. 도구: 일지 초안(M19)·공개 대행(M17.2)·소식 설명(보호자).
// 원칙: 쓰기 도구는 **실행 전 사람 확인 게이트**(확인 카드의 실행 버튼) 필수,
// 보호자 설명은 커밋된 데이터만 근거(관찰 지표 언어). AI 고지 상시 노출.
// mock(규칙 기반) — 실 LLM 은 Edge Function 으로 무변경 전환.

import { useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import {
  AGENT_DISCLOSURE,
  buildJournalDraft,
  runAgentTurn,
  summarizeSharedForGuardian,
  type AgentAction,
  type AgentRole,
} from '@giokon/core';
import {
  parseSessionAnalysis,
  toElderProfile,
  useCareJournals,
  useCreateCareJournal,
  useCreateGuardianShare,
  useCurrentUser,
  useGuardianShares,
  useMySharedContent,
  useProfiles,
  useSessionAnalyses,
} from '@giokon/data';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';
import { cn } from '../lib/utils';

interface ChatMessage {
  id: number;
  from: 'user' | 'agent';
  text: string;
}

export function AgentPanel({ role }: { role: AgentRole }) {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();
  const profilesQuery = useProfiles();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<AgentAction | null>(null);
  const [elderId, setElderId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const isCaregiver = role === 'caregiver';
  const elders = isCaregiver ? (profilesQuery.data ?? []).map(toElderProfile) : [];
  const selectedElder = elders.find((e) => e.id === elderId) ?? null;

  // 도구 실행에 필요한 데이터(요양보호사 — 선택 어르신 기준).
  const journals = useCareJournals(isCaregiver && isConfigured && elderId ? elderId : undefined);
  const analyses = useSessionAnalyses(isCaregiver && isConfigured && elderId ? elderId : undefined);
  const shares = useGuardianShares(isCaregiver && isConfigured && elderId ? elderId : undefined);
  const sharedContent = useMySharedContent({ enabled: !isCaregiver && isConfigured && open });
  const createJournal = useCreateCareJournal();
  const createShare = useCreateGuardianShare();

  function push(from: ChatMessage['from'], text: string) {
    setMessages((prev) => [...prev, { id: prev.length + 1, from, text }]);
  }

  function explainShared(): string {
    const data = sharedContent.data;
    const journalsShared = data?.journals ?? [];
    const analysesShared = data?.analyses ?? [];
    const latestJournal = journalsShared[0];
    const latestAnalysis = analysesShared[0] ? parseSessionAnalysis(analysesShared[0]) : null;
    return summarizeSharedForGuardian({
      journalCount: journalsShared.length,
      analysisCount: analysesShared.length,
      latestJournalExcerpt: latestJournal
        ? latestJournal.content.slice(0, 80)
        : undefined,
      latestAnalysisSummary: latestAnalysis?.summary,
    });
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    push('user', text);
    setInput('');

    const reply = runAgentTurn(role, text);
    push('agent', reply.message);

    if (!reply.action) return;
    if (reply.action.kind === 'explain_shared') {
      // 읽기 전용 설명 — 게이트 불필요, 즉시 실행.
      push('agent', explainShared());
      return;
    }
    setPending(reply.action);
  }

  async function executePending() {
    if (!pending || !isConfigured) return;
    const userId = currentUser.data?.id;
    if (!userId) {
      toast('error', '사용자 정보를 불러오지 못했습니다.');
      return;
    }
    if (!selectedElder) {
      toast('error', '어떤 어르신인지 먼저 선택해 주세요.');
      return;
    }

    setExecuting(true);
    try {
      if (pending.kind === 'draft_journal') {
        const draft = buildJournalDraft({
          elderName: selectedElder.name,
          source: 'typed',
          rawText: pending.rawText,
          date: new Date().toISOString().slice(0, 10),
        });
        await createJournal.mutateAsync({
          author_id: userId,
          profile_id: selectedElder.id,
          content: draft,
          source: 'ai_draft',
          status: 'draft',
        });
        push(
          'agent',
          `${selectedElder.name} 어르신 일지 초안을 저장했어요. 요양일지 메뉴에서 확인·수정 후 확정해 주세요.`,
        );
      } else if (pending.kind === 'publish_journal') {
        const activeShared = new Set(
          (shares.data ?? []).filter((s) => !s.revoked_at && s.item_type === 'journal').map((s) => s.item_id),
        );
        const target = (journals.data ?? []).find(
          (j) => j.status === 'final' && !activeShared.has(j.id),
        );
        if (!target) {
          push('agent', '공개할 수 있는 확정 일지가 없어요. (이미 공개됐거나 초안 상태예요)');
        } else {
          await createShare.mutateAsync({
            shared_by: userId,
            profile_id: selectedElder.id,
            item_type: 'journal',
            item_id: target.id,
          });
          push('agent', `${target.journal_date} 일지를 보호자에게 공개했어요. 공개 관리에서 철회할 수 있어요.`);
        }
      } else if (pending.kind === 'publish_analysis') {
        const activeShared = new Set(
          (shares.data ?? []).filter((s) => !s.revoked_at && s.item_type === 'analysis').map((s) => s.item_id),
        );
        const target = (analyses.data ?? []).find((a) => !activeShared.has(a.id));
        if (!target) {
          push('agent', '공개할 수 있는 새 분석이 없어요.');
        } else {
          await createShare.mutateAsync({
            shared_by: userId,
            profile_id: selectedElder.id,
            item_type: 'analysis',
            item_id: target.id,
          });
          push('agent', '최근 세션 분석을 보호자에게 공개했어요. 공개 관리에서 철회할 수 있어요.');
        }
      }
    } catch (err) {
      push('agent', `실행에 실패했어요: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setExecuting(false);
      setPending(null);
    }
  }

  const ACTION_LABEL: Record<AgentAction['kind'], string> = {
    draft_journal: '일지 초안 저장',
    publish_journal: '확정 일지 공개',
    publish_analysis: '세션 분석 공개',
    explain_shared: '소식 설명',
  };

  return (
    <>
      {/* 플로팅 토글 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed bottom-5 right-5 z-40 p-3.5 rounded-full shadow-lg transition',
          isCaregiver ? 'bg-warm-500 hover:bg-warm-600' : 'bg-violet-500 hover:bg-violet-600',
          'text-white',
        )}
        aria-label="AI 도우미 열기"
      >
        <Bot size={22} />
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-40 w-[360px] max-w-[calc(100vw-2.5rem)] bg-white rounded-2xl border border-slate-200 shadow-xl flex flex-col max-h-[70vh]">
          <header className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Bot size={17} className={isCaregiver ? 'text-warm-600' : 'text-violet-600'} />
            <span className="text-sm font-semibold text-slate-900">AI 도우미</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto p-1 rounded text-slate-400 hover:text-slate-700"
              aria-label="닫기"
            >
              <X size={15} />
            </button>
          </header>

          <div className="px-4 py-2 text-[11px] text-slate-400 border-b border-slate-50" style={{ wordBreak: 'keep-all' }}>
            {AGENT_DISCLOSURE}
          </div>

          {!isConfigured ? (
            <div className="p-5 text-sm text-slate-500 text-center">
              Supabase 연동 후 이용할 수 있어요.
            </div>
          ) : (
            <>
              {isCaregiver ? (
                <div className="px-4 py-2 border-b border-slate-50 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 mr-1">대상:</span>
                  {elders.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setElderId(e.id)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border transition',
                        elderId === e.id
                          ? 'bg-warm-500 text-white border-warm-500'
                          : 'bg-white text-slate-600 border-slate-200',
                      )}
                    >
                      <Avatar name={e.name} color={e.avatarColor} size="sm" />
                      {e.name}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[160px]">
                {messages.length === 0 ? (
                  <p className="text-xs text-slate-500 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
                    {isCaregiver
                      ? '예: "점심 잘 드시고 산책하셨어 — 일지 초안 만들어줘" / "오늘 일지 공개해줘" / "최근 분석 공개해줘"'
                      : '예: "최근 소식 요약해줘"'}
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'text-sm rounded-xl px-3 py-2 whitespace-pre-wrap leading-relaxed max-w-[90%]',
                        m.from === 'user'
                          ? 'bg-slate-900 text-white ml-auto'
                          : 'bg-slate-100 text-slate-800',
                      )}
                      style={{ wordBreak: 'keep-all' }}
                    >
                      {m.text}
                    </div>
                  ))
                )}

                {/* 실행 전 사람 확인 게이트 */}
                {pending ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-800">
                      실행 확인 — {ACTION_LABEL[pending.kind]}
                      {selectedElder ? ` (${selectedElder.name} 어르신)` : ''}
                    </div>
                    {!selectedElder ? (
                      <div className="text-[11px] text-amber-700">위에서 어르신을 먼저 선택해 주세요.</div>
                    ) : null}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={executePending} disabled={executing || !selectedElder}>
                        {executing ? '실행 중...' : '실행'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPending(null)}>
                        취소
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <footer className="p-3 border-t border-slate-100 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder={isCaregiver ? '무엇을 도와드릴까요?' : '소식에 대해 물어보세요'}
                  className="flex-1 h-10 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-warm-300"
                />
                <Button size="sm" onClick={send} className="h-10">
                  <Send size={14} />
                </Button>
              </footer>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
