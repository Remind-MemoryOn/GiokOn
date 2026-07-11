// 법적 문서 페이지 (M9.3) — 개인정보 처리방침(제30조 8항목+위탁+국외이전)·이용약관.
//
// 서비스 실제 구조(Supabase 서울·AI 처리·2년 감사기록·동의 아키텍처)에 맞춘 초안이다.
// ⚠️ 최종 문구는 외부 법무 자문 검토 후 확정한다(화면에 초안 배너 상시 노출).

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream-50">
      <header className="px-6 py-5 border-b border-warm-200/60 bg-white/70 backdrop-blur sticky top-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={15} /> 기억온 홈
          </Link>
          <div className="text-xs text-slate-400">시행(예정)일: {updated}</div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">{title}</h1>
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed">
          이 문서는 서비스 구조에 맞춘 <strong>초안</strong>이며, 외부 법무 자문 검토 후
          확정·시행됩니다. 확정 전 내용은 변경될 수 있습니다.
        </div>
        <article className="prose-sm text-slate-700 leading-relaxed space-y-6 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-8 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_th]:font-semibold [&_th]:p-2 [&_td]:p-2 [&_table]:border [&_th]:border [&_td]:border [&_table]:border-slate-200">
          {children}
        </article>
      </main>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="개인정보 처리방침" updated="2026년 ○월 ○일">
      <p>
        리마인드(이하 "회사")는 인지활동 보조 서비스 "기억온"(이하 "서비스")을 제공하며,
        「개인정보 보호법」 등 관계 법령에 따라 이용자의 개인정보를 보호합니다. 본 방침은
        같은 법 제30조에 따라 다음 사항을 알려드립니다.
      </p>

      <h2>1. 처리 목적</h2>
      <ul>
        <li>요양보호사 계정 관리(가입·인증·서비스 제공)</li>
        <li>어르신 개인화 회상 대화 제공(연대기 기반 질문 생성, 음성 대화 진행)</li>
        <li>세션 기록 제공(대화 전문·요약을 요양보호사·동의된 보호자에게 제공)</li>
        <li>안전 보호(위기 신호 감지 시 요양보호사 알림 — 의학적 판단이 아닌 안전장치)</li>
      </ul>

      <h2>2. 처리 항목</h2>
      <ul>
        <li>요양보호사(계정): 이름, 이메일, 비밀번호(암호화 저장), 소속 기관·역할</li>
        <li>
          어르신(정보주체): 이름, 출생연도, 출신지, 직업, 가족 관계, 주요 기억·취미(연대기),
          보호자 성함·관계
        </li>
        <li>
          <strong>민감정보(별도 동의)</strong>: 대화 음성(음성 인식 처리 후 정책에 따라 파기),
          대화 내용 중 건강 관련 정보
        </li>
        <li>자동 수집: 접속·처리 기록(보안 감사 목적)</li>
      </ul>

      <h2>3. 보유·이용 기간</h2>
      <ul>
        <li>계정 정보: 회원 탈퇴 시까지(탈퇴 시 지체 없이 파기, 법정 보존 항목 제외)</li>
        <li>어르신 데이터: 서비스 이용 계약(기관) 종료 또는 삭제 요청 시 파기</li>
        <li>음성 원본: 음성 인식 처리 후 단기 보관 뒤 자동 파기</li>
        <li>동의·철회 이력: 분쟁 대응을 위해 관련 법정 기간 보존(계정 삭제 시 익명화)</li>
        <li>접속·처리 기록: 「개인정보의 안전성 확보조치 기준」에 따라 최소 2년 보존</li>
      </ul>

      <h2>4. 제3자 제공</h2>
      <p>
        회사는 정보주체의 별도 동의가 있거나 법령에 근거가 있는 경우를 제외하고 개인정보를
        제3자에게 제공하지 않습니다. 동의된 보호자에게는 세션 요약이 제공될 수 있습니다.
      </p>

      <h2>5. 처리 위탁 및 국외 이전</h2>
      <table>
        <thead>
          <tr><th>수탁자</th><th>위탁 업무</th><th>처리 국가</th></tr>
        </thead>
        <tbody>
          <tr><td>Supabase Inc.</td><td>데이터 보관·인증 인프라</td><td>대한민국(서울 리전)</td></tr>
          <tr><td>AI 처리사(LLM)</td><td>대화 질문 생성</td><td>국외 포함(별도 동의)</td></tr>
          <tr><td>음성 처리사(STT/TTS)</td><td>음성 인식·합성</td><td>국내/국외 포함(별도 동의)</td></tr>
        </tbody>
      </table>
      <p className="text-xs text-slate-500">
        국외 이전이 수반되는 처리는 이전 항목·국가·보유기간을 고지하고 별도 동의를 받습니다.
        수탁자 확정 시 본 표는 갱신됩니다.
      </p>

      <h2>6. 정보주체의 권리와 행사 방법</h2>
      <ul>
        <li>열람·정정·삭제·처리정지 요구 및 동의 철회: 서비스 내 설정 또는 문의 채널</li>
        <li>내 데이터 다운로드(이동권): 설정 → 내 데이터 다운로드</li>
        <li>어르신(정보주체)의 권리는 본인 또는 정당한 대리인(성년후견인 등)이 행사할 수 있습니다.</li>
      </ul>

      <h2>7. 파기 절차 및 방법</h2>
      <p>
        보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자 파일은
        복구 불가능한 방법으로 삭제하며, 자동 파기 스케줄(음성·로그)을 운영합니다.
      </p>

      <h2>8. 안전성 확보 조치</h2>
      <ul>
        <li>데이터 국내 보관(서울 리전), 전송·저장 암호화</li>
        <li>기관 단위 접근 격리(행 수준 보안), 최소 권한 역할 관리</li>
        <li>접속·처리 기록 보존(최소 2년) 및 점검, 취약점 점검</li>
      </ul>

      <h2>9. 개인정보 보호책임자</h2>
      <p>
        성명: ○○○ · 직책: 개인정보 보호책임자(CPO) · 문의: privacy@giokon.example
        <br />
        <span className="text-xs text-slate-500">(지정 확정 후 갱신 예정)</span>
      </p>

      <h2>10. 고지 의무</h2>
      <p>본 방침이 변경되는 경우 시행 7일 전부터 서비스 내 공지사항으로 알려드립니다.</p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="이용약관" updated="2026년 ○월 ○일">
      <h2>제1조 (목적)</h2>
      <p>
        본 약관은 리마인드(이하 "회사")가 제공하는 인지활동 보조 서비스 "기억온"(이하
        "서비스")의 이용 조건과 회사·이용자 간 권리·의무를 정합니다.
      </p>

      <h2>제2조 (서비스의 성격 — 비의료 고지)</h2>
      <p className="font-semibold text-slate-900 bg-warm-50 border border-warm-200 rounded-lg px-3 py-2">
        기억온은 의료기기가 아니며, 질병의 판정·의학적 소견 제공을 목적으로 하지 않습니다.
        서비스는 어르신의 회상 대화와 정서 지원을 돕는 인지활동 보조 도구이며, 건강에 관한
        판단·상담은 반드시 의료 전문가에게 받으시기 바랍니다.
      </p>

      <h2>제3조 (계정)</h2>
      <ul>
        <li>요양보호사·기관 관리자는 본인 정보를 정확히 등록해야 합니다.</li>
        <li>계정 인증 수단은 타인과 공유할 수 없으며, 관리 소홀로 인한 책임은 이용자에게 있습니다.</li>
        <li>어르신 데이터는 소속 기관에 귀속되며, 담당자 변경 시 기관 내에서 인계됩니다.</li>
      </ul>

      <h2>제4조 (AI 대화 서비스)</h2>
      <ul>
        <li>대화는 사람이 아닌 AI가 진행하며, 화면에 그 사실을 표시합니다.</li>
        <li>AI 생성 내용에는 오류가 있을 수 있으며, 회사는 지속적으로 품질을 개선합니다.</li>
        <li>
          위기 신호 감지 시 요양보호사에게 알림이 전달될 수 있습니다. 이는 안전장치이며
          의학적 판단이 아닙니다.
        </li>
      </ul>

      <h2>제5조 (이용자의 의무)</h2>
      <ul>
        <li>어르신 정보 등록 전 필요한 동의(민감정보·국외이전·AI 이용)를 확보해야 합니다.</li>
        <li>타인의 권리를 침해하거나 서비스를 부정한 목적으로 이용할 수 없습니다.</li>
      </ul>

      <h2>제6조 (서비스 변경·중단)</h2>
      <p>
        회사는 운영상·기술상 필요에 따라 서비스를 변경할 수 있으며, 중대한 변경은 사전에
        공지합니다.
      </p>

      <h2>제7조 (책임의 제한)</h2>
      <p>
        회사는 천재지변, 이용자 귀책 사유로 인한 손해에 책임을 지지 않습니다. 서비스는
        돌봄 인력을 대체하지 않으며, 응급 상황 대응 의무는 보호자·기관에 있습니다.
      </p>

      <h2>제8조 (분쟁 해결)</h2>
      <p>
        서비스 이용과 관련한 분쟁은 상호 협의로 해결하며, 협의가 어려운 경우 관할 법원에
        제소할 수 있습니다.
      </p>
    </LegalLayout>
  );
}
