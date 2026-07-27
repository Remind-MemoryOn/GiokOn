// 요양일지 작성 (SCR-W06 — T19.2 / Phase W4, 현직자 1순위 요청)
//
// 입력 3경로: 직접 타이핑 / 구어(음성 — 브라우저 STT, 미지원 시 안내) /
// 사진 첨부(사진 속 내용 자동 인식[LLM 비전]은 실 AI 연동 후 — T19.3).
// AI 초안(core buildJournalDraft — mock)은 항상 확인·수정 후 저장한다(F-25).
// 저장: 초안(draft) → 확정(final). 확정 일지는 공개 체크리스트(W5)에서
// 보호자에게 선별 공개할 수 있다. 민감정보 취급.

import { useRef, useState } from 'react';
import { Camera, FileAudio, Keyboard, Mic, MicOff, NotebookPen, Sparkles, Trash2, Upload } from 'lucide-react';
import { buildJournalDraft, type JournalDraftSource } from '@giokon/core';
import {
  toElderProfile,
  transcribeAudio,
  useCareJournals,
  useCreateCareJournal,
  useCurrentUser,
  useDeleteCareJournal,
  useProfiles,
  useUpdateCareJournal,
} from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';
import { uploadJournalPhoto } from '../lib/journalPhotos';
import { formatKoreanDateTime } from '../lib/utils';
import { cn } from '../lib/utils';

type InputTab = 'typed' | 'voice' | 'photo';

const SOURCE_LABEL: Record<string, string> = {
  typed: '타이핑',
  voice: '음성',
  photo: '사진',
  ai_draft: 'AI 초안',
};

// 브라우저 STT(있으면 사용 — 크롬 등). 실 STT(gpt-4o-transcribe)는 실 AI 단계.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function createSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function CareJournalPage() {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();
  const profilesQuery = useProfiles();

  const elders = (profilesQuery.data ?? []).map(toElderProfile);
  const [elderId, setElderId] = useState<string | null>(null);
  const selectedElder = elders.find((e) => e.id === elderId) ?? null;

  const journals = useCareJournals(isConfigured && elderId ? elderId : undefined);
  const createJournal = useCreateCareJournal();
  const updateJournal = useUpdateCareJournal();
  const deleteJournal = useDeleteCareJournal();

  const [tab, setTab] = useState<InputTab>('typed');
  const [rawText, setRawText] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // 음성 파일 업로드 → CLOVA STT(Edge Function)로 텍스트 변환 후 원문에 붙인다.
  async function transcribeFile(file: File) {
    if (!isConfigured) {
      toast('error', 'Supabase 연동 후 음성 인식을 사용할 수 있어요.');
      return;
    }
    setTranscribing(true);
    try {
      const text = await transcribeAudio(file, { lang: 'Kor' });
      setRawText((prev) => (prev ? `${prev} ` : '') + text.trim());
      toast('success', '음성 파일을 텍스트로 옮겼어요. 내용을 확인해 주세요.');
    } catch (err) {
      toast(
        'error',
        err instanceof Error
          ? `음성 인식 실패: ${err.message} (STT 서버(stt-transcribe) 배포 후 이용 가능)`
          : '음성 인식에 실패했습니다.',
      );
    } finally {
      setTranscribing(false);
    }
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = createSpeechRecognition();
    if (!recognition) {
      toast('info', '이 브라우저는 음성 입력을 지원하지 않아요. 타이핑으로 입력해 주세요.');
      return;
    }
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        parts.push(event.results[i][0].transcript);
      }
      setRawText((prev) => (prev ? `${prev} ` : '') + parts.join(' ').trim());
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function makeDraft() {
    if (!selectedElder) {
      toast('error', '어르신을 먼저 선택해 주세요.');
      return;
    }
    try {
      const source: JournalDraftSource = tab === 'photo' ? 'photo' : tab;
      setDraft(
        buildJournalDraft({
          elderName: selectedElder.name,
          source,
          rawText,
          date: new Date().toISOString().slice(0, 10),
        }),
      );
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '초안 생성에 실패했습니다.');
    }
  }

  async function save(status: 'draft' | 'final') {
    if (!isConfigured) return;
    const authorId = currentUser.data?.id;
    if (!authorId) {
      toast('error', '사용자 정보를 불러오지 못했습니다.');
      return;
    }
    if (!selectedElder) {
      toast('error', '어르신을 먼저 선택해 주세요.');
      return;
    }
    const content = (draft ?? rawText).trim();
    if (!content) {
      toast('error', '일지 내용을 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      let photoPath: string | undefined;
      if (photoFile) {
        photoPath = await uploadJournalPhoto(selectedElder.id, photoFile);
      }
      await createJournal.mutateAsync({
        author_id: authorId,
        profile_id: selectedElder.id,
        content,
        source: draft ? 'ai_draft' : tab === 'photo' ? 'photo' : tab,
        photo_path: photoPath ?? null,
        status,
      });
      setRawText('');
      setDraft(null);
      setPhotoFile(null);
      toast('success', status === 'final' ? '일지를 확정 저장했어요.' : '초안을 저장했어요.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const tabButton = (key: InputTab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={cn(
        'flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-semibold transition',
        tab === key ? 'bg-warm-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
      )}
    >
      {icon} {label}
    </button>
  );

  return (
    <>
      <PageHeader
        title="요양일지"
        description="사진·음성·타이핑으로 기록하면 AI가 초안을 정리해 드려요. 저장 전 꼭 확인해 주세요."
      />
      <div className="flex-1 px-8 py-6 space-y-5 overflow-y-auto">
        {!isConfigured ? (
          <Card>
            <CardBody className="py-16 text-center text-sm text-slate-500">
              Supabase 연동 후 요양일지를 작성할 수 있습니다.
            </CardBody>
          </Card>
        ) : (
          <>
            {/* 어르신 선택 */}
            <div className="flex items-center gap-2 flex-wrap">
              {elders.length === 0 ? (
                <span className="text-sm text-slate-500">먼저 어르신을 등록해 주세요.</span>
              ) : (
                elders.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setElderId(e.id)}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition',
                      elderId === e.id
                        ? 'bg-warm-500 text-white border-warm-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-warm-300',
                    )}
                  >
                    <Avatar name={e.name} color={e.avatarColor} size="sm" />
                    {e.name}
                  </button>
                ))
              )}
            </div>

            {/* 작성 카드 */}
            <Card>
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold flex items-center gap-2">
                  <NotebookPen size={16} className="text-warm-600" /> 오늘의 일지 작성
                  {selectedElder ? (
                    <span className="text-sm font-normal text-slate-500">
                      — {selectedElder.name} 어르신
                    </span>
                  ) : null}
                </h3>
              </div>
              <CardBody className="space-y-4">
                <div className="flex gap-2">
                  {tabButton('typed', <Keyboard size={15} />, '타이핑')}
                  {tabButton('voice', listening ? <MicOff size={15} /> : <Mic size={15} />, '음성')}
                  {tabButton('photo', <Camera size={15} />, '사진')}
                </div>

                {tab === 'voice' ? (
                  <div className="space-y-3">
                    {/* ① 실시간 음성 입력(브라우저 STT) */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <Button
                        variant={listening ? 'danger' : 'outline'}
                        onClick={toggleListening}
                        size="sm"
                      >
                        {listening ? (
                          <>
                            <MicOff size={14} /> 입력 종료
                          </>
                        ) : (
                          <>
                            <Mic size={14} /> 실시간 음성 입력
                          </>
                        )}
                      </Button>
                      <span className="text-xs text-slate-500" style={{ wordBreak: 'keep-all' }}>
                        말씀하시면 아래 원문에 붙습니다(브라우저 음성 인식).
                      </span>
                    </div>

                    {/* ② 음성 파일 업로드 → CLOVA STT */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <FileAudio size={15} className="text-warm-600" /> 음성 파일 올리기 (CLOVA 음성 인식)
                      </div>
                      <label className={cn(
                        'inline-flex items-center gap-2 rounded-lg border border-warm-300 bg-white px-3 py-2 text-sm font-semibold text-warm-700 cursor-pointer hover:bg-warm-50 transition',
                        transcribing && 'opacity-60 pointer-events-none',
                      )}>
                        <Upload size={15} />
                        {transcribing ? '변환 중…' : '음성 파일 선택'}
                        <input
                          type="file"
                          accept="audio/*,.m4a,.mp3,.wav,.aac"
                          className="hidden"
                          disabled={transcribing}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void transcribeFile(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <p className="text-[11px] text-slate-500 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
                        녹음한 음성 파일(mp3·m4a·wav 등)을 올리면 CLOVA 음성 인식으로 텍스트로 옮겨
                        아래 원문에 붙습니다. 인식 결과는 저장 전 꼭 확인해 주세요.
                      </p>
                    </div>
                  </div>
                ) : null}

                {tab === 'photo' ? (
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-warm-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-warm-700 hover:file:bg-warm-200"
                    />
                    <p className="text-xs text-slate-500" style={{ wordBreak: 'keep-all' }}>
                      수기 일지 사진을 첨부하세요. 사진 속 글씨 자동 인식(AI 비전)은 실 AI 연동
                      후 제공됩니다 — 지금은 내용을 아래에 직접 입력해 주세요.
                      {photoFile ? ` (첨부됨: ${photoFile.name})` : ''}
                    </p>
                  </div>
                ) : null}

                <Textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={5}
                  placeholder="예: 점심 식사를 남김없이 드셨어요. 오후에 20분 산책하셨고 따님과 통화 후 기분이 밝으셨습니다."
                />

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={makeDraft} disabled={!rawText.trim()}>
                    <Sparkles size={14} /> AI 초안 만들기
                  </Button>
                  <span className="text-[11px] text-slate-400" style={{ wordBreak: 'keep-all' }}>
                    초안은 자동 저장되지 않아요 — 확인·수정 후 직접 저장합니다.
                  </span>
                </div>

                {draft !== null ? (
                  <div className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/40 p-4">
                    <div className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                      <Sparkles size={13} /> AI 초안 — 확인·수정해 주세요 (AI 생성물)
                    </div>
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={10}
                      className="font-mono text-xs"
                    />
                  </div>
                ) : null}

                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={() => save('final')} disabled={saving}>
                    {saving ? '저장 중...' : '확정 저장'}
                  </Button>
                  <Button variant="outline" onClick={() => save('draft')} disabled={saving}>
                    초안으로 저장
                  </Button>
                </div>
              </CardBody>
            </Card>

            {/* 일지 이력 */}
            {selectedElder ? (
              <Card>
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold">{selectedElder.name} 어르신 일지 이력</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    확정된 일지는 공개 체크리스트에서 보호자에게 선별 공개할 수 있어요.
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {journals.isLoading ? (
                    <div className="px-5 py-10 text-center text-sm text-slate-500">
                      불러오는 중...
                    </div>
                  ) : (journals.data ?? []).length === 0 ? (
                    <div className="px-5 py-10 text-center text-sm text-slate-500">
                      아직 작성된 일지가 없어요.
                    </div>
                  ) : (
                    (journals.data ?? []).map((j) => (
                      <div key={j.id} className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-semibold text-slate-900">
                            {j.journal_date}
                          </span>
                          <Badge tone={j.status === 'final' ? 'success' : 'warning'}>
                            {j.status === 'final' ? '확정' : '초안'}
                          </Badge>
                          <Badge tone="neutral">{SOURCE_LABEL[j.source] ?? j.source}</Badge>
                          {j.photo_path ? <Badge tone="info">사진 첨부</Badge> : null}
                          <span className="ml-auto text-[11px] text-slate-400">
                            {formatKoreanDateTime(j.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed" style={{ wordBreak: 'keep-all' }}>
                          {j.content.length > 400 ? `${j.content.slice(0, 400)}…` : j.content}
                        </p>
                        {j.status === 'draft' ? (
                          <div className="flex items-center gap-2 mt-2.5">
                            <Button
                              size="sm"
                              onClick={() =>
                                updateJournal.mutate(
                                  { id: j.id, patch: { status: 'final' } },
                                  {
                                    onSuccess: () => toast('success', '일지를 확정했어요.'),
                                    onError: (err) => toast('error', err.message),
                                  },
                                )
                              }
                            >
                              확정
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                deleteJournal.mutate(
                                  { id: j.id, profileId: j.profile_id },
                                  {
                                    onSuccess: () => toast('info', '초안을 삭제했어요.'),
                                    onError: (err) => toast('error', err.message),
                                  },
                                )
                              }
                            >
                              <Trash2 size={13} /> 삭제
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
