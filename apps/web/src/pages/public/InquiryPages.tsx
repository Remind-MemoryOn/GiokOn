// 문의사항 게시판 — 목록 / 상세(운영자 답변) / 등록·수정.
//
// 비공개 규약: 비공개 문의의 **제목·작성자·본문은 작성자와 사이트 운영자만** 본다.
//   목록은 서버 함수 `list_inquiries()` 가 이미 가려서 보내고(`locked`), 본문은 RLS 가 막는다.
//   화면은 그 판정을 다시 하지 않고 서버가 준 값을 그대로 쓴다.
//
// 이 화면은 새 Figma 파일에 없다(2026-09-02 사용자 승인 신규 기능) — 공개 화면 셸(헤더·푸터)과
// 기존 프리미티브(Button·Field·Input·Textarea·Dialog·toast)만 쓰고 임의 스타일을 만들지 않는다.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCreateInquiry,
  useCreateInquiryReply,
  useDeleteInquiry,
  useDeleteInquiryReply,
  useInquiry,
  useInquiryList,
  useInquiryReplies,
  useUpdateInquiry,
  useUpdateInquiryReply,
} from '@giokon/data';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { PublicFooter } from '../../components/shell/PublicFooter';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field, Input, Textarea } from '../../components/ui/Input';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(value),
  );

/** 한 번에 받아 오는 문의 수. "더보기" 마다 이만큼 늘린다(서버가 100 에서 자른다). */
const PAGE = 20;

const ROW = 'grid w-full grid-cols-[1fr_160px_140px_130px] items-center px-8';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fbfbfb]">
      <PublicHeader />
      <main className="mx-auto min-h-[760px] w-full max-w-[1204px] py-20">{children}</main>
      <PublicFooter />
    </div>
  );
}

export function InquiryListPage() {
  const { session, isConfigured } = useAuth();
  const navigate = useNavigate();
  const toast = useStore((s) => s.toast);
  // "더보기" 는 limit 만 키운다 — offset 페이징은 새 글이 끼어들면 행이 밀린다.
  const [limit, setLimit] = useState(PAGE);
  const list = useInquiryList(limit, { enabled: isConfigured });
  const items = list.data?.items ?? [];

  const requireLogin = (to: string) => {
    if (!session) {
      toast('info', '로그인이 먼저 필요한 서비스입니다.');
      navigate('/login', { state: { from: to } });
      return;
    }
    navigate(to);
  };

  return (
    <Shell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[40px] font-bold text-ink-900">문의사항</h1>
          <p className="mt-4 text-w-body text-ink-500">
            서비스 이용 중 궁금한 점과 불편한 사항을 확인하거나 등록할 수 있어요.
          </p>
        </div>
        <Button onClick={() => requireLogin('/inquiries/new')}>문의 등록</Button>
      </div>

      <div className="mt-12 overflow-hidden rounded-[10px] border border-line bg-white shadow-card">
        <div className={`${ROW} bg-mute py-4 text-w-label font-semibold text-ink-500`}>
          <span>제목</span>
          <span>작성자</span>
          <span>작성일</span>
          <span>상태</span>
        </div>

        {list.isLoading ? (
          <p className="px-8 py-16 text-center text-ink-500">문의사항을 불러오고 있어요.</p>
        ) : list.isError ? (
          // 실패를 "없음"으로 보이게 두지 않는다 — 다시 시도할 길을 준다.
          <div className="px-8 py-16 text-center" role="alert">
            <p className="text-ink-700">문의사항을 불러오지 못했어요.</p>
            <p className="mt-2 text-w-label text-ink-500">
              {list.error instanceof Error ? list.error.message : '잠시 후 다시 시도해 주세요.'}
            </p>
            <Button variant="outline" size="sm" className="mt-5" onClick={() => void list.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-8 py-16 text-center text-ink-500">아직 등록된 문의사항이 없어요.</p>
        ) : (
          items.map((item) => {
            const title = (
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={`truncate text-w-body font-semibold ${item.locked ? 'text-ink-500' : 'text-ink-900'}`}
                >
                  {item.title}
                </span>
                {item.visibility === 'private' ? (
                  <span className="shrink-0 rounded-pill bg-mute px-3 py-1 text-w-caption text-ink-500">
                    비공개
                  </span>
                ) : null}
              </span>
            );
            const rest = (
              <>
                <span className="text-w-sub text-ink-500">{item.masked_author}</span>
                <span className="text-w-sub text-ink-500">{dateLabel(item.created_at)}</span>
                <span
                  className={`text-w-sub font-semibold ${item.status === 'answered' ? 'text-accent' : 'text-ink-500'}`}
                >
                  {item.status === 'answered' ? '답변 완료' : '답변 대기'}
                </span>
              </>
            );

            // 잠긴 행은 열 수 없으므로 버튼이 아니다 — 스크린리더에도 클릭 대상으로 노출하지 않는다.
            return item.locked ? (
              <div key={item.id} className={`${ROW} border-t border-line py-5 text-left`}>
                {title}
                {rest}
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => requireLogin(`/inquiries/${item.id}`)}
                className={`${ROW} border-t border-line py-5 text-left hover:bg-accent/[0.03] focus:outline-none focus-visible:bg-accent/[0.06]`}
              >
                {title}
                {rest}
              </button>
            );
          })
        )}
      </div>

      {list.data && list.data.total > items.length ? (
        <div className="mt-8 text-center">
          <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)} disabled={list.isFetching}>
            {list.isFetching ? '불러오는 중...' : `더보기 (${items.length}/${list.data.total})`}
          </Button>
        </div>
      ) : null}

      {items.some((item) => item.locked) ? (
        <p className="mt-5 text-w-label text-ink-500">
          비공개 문의의 제목과 내용은 작성자와 사이트 운영자만 볼 수 있어요.
        </p>
      ) : null}
      {!isConfigured ? (
        <p className="mt-5 text-w-label text-ink-500">
          Supabase 연결 후 실제 문의 목록이 표시됩니다.
        </p>
      ) : null}
    </Shell>
  );
}

export function InquiryDetailPage() {
  const { inquiryId } = useParams();
  const navigate = useNavigate();
  const { userRow, isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const row = useInquiry(inquiryId, { enabled: isConfigured });
  const replies = useInquiryReplies(inquiryId, { enabled: isConfigured });
  const remove = useDeleteInquiry();
  const addReply = useCreateInquiryReply();
  const updateReply = useUpdateInquiryReply();
  const deleteReply = useDeleteInquiryReply();

  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [confirming, setConfirming] = useState<
    { kind: 'inquiry' } | { kind: 'reply'; id: string } | null
  >(null);

  const admin = Boolean(userRow?.is_site_admin);
  const mine = Boolean(userRow && row.data && row.data.author_id === userRow.id);

  return (
    <Shell>
      <Link to="/inquiries" className="font-semibold text-ink-500 hover:text-accent">
        ← 문의사항 목록
      </Link>

      {row.isLoading ? (
        <p className="mt-12 text-center text-ink-500">문의를 불러오고 있어요.</p>
      ) : !row.data ? (
        <div className="mt-12 rounded-[10px] border border-line bg-white px-8 py-16 text-center">
          <h1 className="text-w-nav font-semibold">내용을 열람할 수 없습니다.</h1>
          <p className="mt-3 text-w-sub text-ink-500">
            비공개 문의는 작성자와 사이트 운영자만 볼 수 있어요.
          </p>
        </div>
      ) : (
        <article className="mt-10 rounded-[10px] bg-white p-10 shadow-card">
          <div className="flex items-start justify-between gap-8">
            <div>
              <div className="flex gap-3">
                <span className="rounded-pill bg-mute px-3 py-1 text-w-caption text-ink-500">
                  {row.data.visibility === 'private' ? '비공개' : '공개'}
                </span>
                <span className="rounded-pill bg-accent-soft px-3 py-1 text-w-caption text-accent">
                  {row.data.status === 'answered' ? '답변 완료' : '답변 대기'}
                </span>
              </div>
              <h1 className="mt-5 text-[30px] font-bold text-ink-900">{row.data.title}</h1>
              <time className="mt-3 block text-w-label text-ink-500">
                {dateLabel(row.data.created_at)}
              </time>
            </div>
            {mine || admin ? (
              <div className="flex shrink-0 gap-3">
                {mine ? (
                  <Link to={`/inquiries/${row.data.id}/edit`}>
                    <Button size="sm" variant="outline">
                      수정
                    </Button>
                  </Link>
                ) : null}
                <Button size="sm" variant="danger" onClick={() => setConfirming({ kind: 'inquiry' })}>
                  삭제
                </Button>
              </div>
            ) : null}
          </div>

          <div className="my-8 border-t border-line" />
          <p className="whitespace-pre-wrap text-w-body leading-9 text-ink-700">{row.data.content}</p>

          <section className="mt-12 border-t border-line pt-8">
            <h2 className="text-w-nav font-semibold">운영자 답변</h2>
            {!replies.data?.length ? (
              <p className="mt-5 text-w-sub text-ink-500">아직 등록된 답변이 없어요.</p>
            ) : (
              <div className="mt-5 space-y-4">
                {replies.data.map((item) =>
                  editing?.id === item.id ? (
                    <form
                      key={item.id}
                      className="rounded-[10px] bg-accent/[0.06] p-6"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const content = editing.content.trim();
                        if (!content) return toast('error', '답변 내용을 입력해 주세요.');
                        updateReply.mutate(
                          { id: item.id, inquiryId: row.data!.id, content },
                          {
                            onSuccess: () => {
                              setEditing(null);
                              toast('success', '답변을 수정했어요.');
                            },
                            onError: (err) => toast('error', err.message),
                          },
                        );
                      }}
                    >
                      <Textarea
                        value={editing.content}
                        onChange={(e) => setEditing({ id: item.id, content: e.target.value })}
                        aria-label="답변 수정"
                        rows={5}
                      />
                      <div className="mt-3 flex justify-end gap-3">
                        <Button size="sm" variant="outline" type="button" onClick={() => setEditing(null)}>
                          취소
                        </Button>
                        <Button size="sm" type="submit" disabled={updateReply.isPending}>
                          수정 완료
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div key={item.id} className="rounded-[10px] bg-accent/[0.06] p-6">
                      <p className="whitespace-pre-wrap text-w-sub leading-7 text-ink-700">
                        {item.content}
                      </p>
                      {admin ? (
                        <div className="mt-4 flex gap-3 text-w-label">
                          <button
                            type="button"
                            onClick={() => setEditing({ id: item.id, content: item.content })}
                            className="font-semibold text-accent hover:underline"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming({ kind: 'reply', id: item.id })}
                            className="font-semibold text-alert hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            )}

            {admin ? (
              <form
                className="mt-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reply.trim() || !userRow) return;
                  addReply.mutate(
                    { inquiry_id: row.data!.id, author_id: userRow.id, content: reply.trim() },
                    {
                      onSuccess: () => {
                        setReply('');
                        toast('success', '답변을 등록했어요.');
                      },
                      onError: (err) => toast('error', err.message),
                    },
                  );
                }}
              >
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  aria-label="운영자 답변"
                  placeholder="사이트 운영자 답변을 입력하세요."
                />
                <div className="mt-3 flex justify-end">
                  <Button type="submit" size="sm" disabled={addReply.isPending}>
                    답변 등록
                  </Button>
                </div>
              </form>
            ) : null}
          </section>
        </article>
      )}

      <ConfirmDialog
        open={confirming?.kind === 'inquiry'}
        title="문의사항을 삭제할까요?"
        description="삭제한 문의사항과 답변은 되돌릴 수 없어요."
        confirmLabel="삭제"
        onClose={() => setConfirming(null)}
        onConfirm={() =>
          row.data &&
          remove.mutate(row.data.id, {
            onSuccess: () => {
              toast('success', '문의사항을 삭제했어요.');
              navigate('/inquiries');
            },
            onError: (err) => toast('error', err.message),
          })
        }
      />
      <ConfirmDialog
        open={confirming?.kind === 'reply'}
        title="답변을 삭제할까요?"
        description="삭제한 답변은 되돌릴 수 없어요."
        confirmLabel="삭제"
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming?.kind !== 'reply' || !row.data) return;
          deleteReply.mutate(
            { id: confirming.id, inquiryId: row.data.id },
            {
              onSuccess: () => toast('success', '답변을 삭제했어요.'),
              onError: (err) => toast('error', err.message),
            },
          );
        }}
      />
    </Shell>
  );
}

/** 등록↔수정은 같은 컴포넌트라 라우트가 바뀌어도 초안이 남는다 → 모드를 key 로 새로 마운트. */
export function InquiryFormPage({ edit = false }: { edit?: boolean }) {
  const { inquiryId } = useParams();
  return <InquiryForm key={edit ? `edit:${inquiryId ?? ''}` : 'new'} edit={edit} />;
}

function InquiryForm({ edit }: { edit: boolean }) {
  const { inquiryId } = useParams();
  const navigate = useNavigate();
  const { userRow, isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const current = useInquiry(inquiryId, { enabled: edit && isConfigured });
  const create = useCreateInquiry();
  const update = useUpdateInquiry();

  // 수정 모드는 불러온 값이 초기값이고, 사용자가 손대면 그 값이 이긴다.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [contentDraft, setContentDraft] = useState<string | null>(null);
  const [visibilityDraft, setVisibilityDraft] = useState<'public' | 'private' | null>(null);
  const title = titleDraft ?? current.data?.title ?? '';
  const content = contentDraft ?? current.data?.content ?? '';
  const visibility = visibilityDraft ?? current.data?.visibility ?? 'private';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!userRow) return toast('error', '로그인이 먼저 필요한 서비스입니다.');
    if (!title.trim() || !content.trim()) return toast('error', '제목과 내용을 입력해 주세요.');
    const done = (id: string) => {
      toast('success', edit ? '문의사항을 수정했어요.' : '문의사항을 등록했어요.');
      navigate(`/inquiries/${id}`);
    };
    if (edit && inquiryId) {
      update.mutate(
        { id: inquiryId, patch: { title: title.trim(), content: content.trim(), visibility } },
        { onSuccess: (row) => done(row.id), onError: (err) => toast('error', err.message) },
      );
    } else {
      create.mutate(
        { author_id: userRow.id, title: title.trim(), content: content.trim(), visibility },
        { onSuccess: (row) => done(row.id), onError: (err) => toast('error', err.message) },
      );
    }
  };

  return (
    <Shell>
      <Link
        to={edit && inquiryId ? `/inquiries/${inquiryId}` : '/inquiries'}
        className="font-semibold text-ink-500 hover:text-accent"
      >
        ← 돌아가기
      </Link>
      <h1 className="mt-10 text-[36px] font-bold text-ink-900">
        {edit ? '문의사항 수정' : '문의사항 등록'}
      </h1>

      <form onSubmit={submit} className="mt-10 space-y-7 rounded-[10px] bg-white p-10 shadow-card">
        <Field
          label="공개 설정"
          required
          hint="비공개로 등록하면 제목과 내용을 작성자와 사이트 운영자만 볼 수 있어요."
        >
          <div className="flex gap-3">
            {(['public', 'private'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={visibility === value}
                onClick={() => setVisibilityDraft(value)}
                className={`rounded-[10px] border px-6 py-3 font-semibold transition ${
                  visibility === value
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-ink-500 hover:bg-mute/40'
                }`}
              >
                {value === 'public' ? '공개' : '비공개'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="제목" required counter={`${title.length}/100`}>
          <Input maxLength={100} value={title} onChange={(e) => setTitleDraft(e.target.value)} />
        </Field>

        <Field
          label="내용"
          required
          counter={`${content.length}/5000`}
          hint="민감정보나 어르신의 식별정보는 필요한 범위 이상 입력하지 마세요."
        >
          <Textarea
            rows={10}
            maxLength={5000}
            value={content}
            onChange={(e) => setContentDraft(e.target.value)}
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending || update.isPending}>
            {edit ? '수정 완료' : '등록하기'}
          </Button>
        </div>
      </form>
    </Shell>
  );
}
