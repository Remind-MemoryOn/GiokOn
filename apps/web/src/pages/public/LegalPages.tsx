import { Link, useParams } from 'react-router-dom';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { PublicFooter } from '../../components/shell/PublicFooter';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '../../content/legalDocuments';

// HWP 본문 제어문자가 텍스트 추출 과정에서 글리프로 남은 부분만 화면에서 복원한다.
// 문장 자체는 첨부 원문을 변경하지 않는다.
function cleanHwpText(value: string): string {
  return value.replaceAll('汫╨', '').replaceAll('汫h', '').replaceAll('', '·');
}

const DOCUMENT_SLUGS: Partial<Record<LegalDocumentId, string>> = {
  memberPrivacy: 'member-privacy',
  elderPrivacy: 'elder-privacy',
  elderSensitive: 'elder-sensitive',
  elderCrossBorder: 'elder-cross-border',
  elderAi: 'elder-ai',
};

const PUBLIC_LEGAL_TITLES: Partial<Record<LegalDocumentId, string>> = {
  privacy: '개인정보 처리방침',
  terms: '이용약관',
};

const LEGAL_ACCURACY_NOTICE =
  '처리위탁·국외 이전 등 실제로 확정된 정보만 공개하며, 확정되지 않은 정보를 임의로 표시하지 않습니다.';

function lineKind(line: string): 'heading' | 'bullet' | 'paragraph' {
  if (/^(제\d+조|부칙|개인정보 수집·이용 내역|민감정보 처리 내역|개인정보 국외 이전 내역|생성형 AI가 하는 일|AI에 제공되는 정보|생성형 AI 이용 시 유의사항|위기 및 응급상황 안내|어르신의 선택권|음성 및 대화 기록|처리 및 보관 방법|보유·이용 기간|동의를 거부할 권리 및 거부 시 불이익|개인정보 관련 문의|수집·이용 목적|수집·이용하는 개인정보|수집하는 개인정보 항목|처리 목적|처리하는 민감정보 항목|이전받는 자|개인정보가 처리되는 국가|Google의 재위탁 처리 안내|국외 이전 목적|국외 이전되는 개인정보 항목|이전 일시 및 방법)$/.test(line)) return 'heading';
  if (/^(-|\d+\.)\s?/.test(line)) return 'bullet';
  return 'paragraph';
}

function LegalBody({ body }: { body: string }) {
  const lines = body.split(/\r?\n/).map((line) => cleanHwpText(line.trim())).filter(Boolean);
  return (
    <div className="mt-10 space-y-3 text-w-body leading-8 text-ink-700" style={{ wordBreak: 'keep-all' }}>
      {lines.slice(2).map((line, index) => {
        const kind = lineKind(line);
        if (kind === 'heading') return <h2 key={index} className="pt-6 text-w-nav font-bold leading-8 text-ink-900">{line}</h2>;
        if (kind === 'bullet') return <p key={index} className="pl-5">{line}</p>;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

export function LegalDocumentPage({ documentId }: { documentId: LegalDocumentId }) {
  const document = LEGAL_DOCUMENTS[documentId];
  const [rawTitle, rawDate] = document.body.split(/\r?\n/).filter(Boolean);
  const sourceTitle = cleanHwpText(rawTitle ?? PUBLIC_LEGAL_TITLES[documentId] ?? document.title);
  const sourceDate = cleanHwpText(rawDate ?? `작성일 : ${document.date}`);
  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1204px] px-6 py-20">
        <article className="rounded-[10px] bg-white px-8 py-12 shadow-card md:px-16 md:py-14">
          <h1 className="text-[34px] font-bold text-ink-900 md:text-[38px]">{sourceTitle}</h1>
          <p className="mt-3 text-w-label text-ink-500">{sourceDate}</p>
          {documentId === 'privacy' ? (
            <p className="mt-6 rounded-[10px] border border-accent bg-accent/10 p-5 text-w-label leading-7 text-ink-700">
              {LEGAL_ACCURACY_NOTICE}
            </p>
          ) : null}
          <LegalBody body={document.body} />
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}

export function ConsentDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const entry = (Object.keys(DOCUMENT_SLUGS) as LegalDocumentId[]).find((id) => DOCUMENT_SLUGS[id] === documentId);
  if (!entry) return <div className="p-10"><p>문서를 찾을 수 없습니다.</p><Link to="/">홈으로 돌아가기</Link></div>;
  return <LegalDocumentPage documentId={entry} />;
}

export const PrivacyPolicyPage = () => <LegalDocumentPage documentId="privacy" />;
export const TermsPage = () => <LegalDocumentPage documentId="terms" />;
