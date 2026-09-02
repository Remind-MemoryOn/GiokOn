// 이용안내 (Figma 1:17 — 1440×4218 실측)
//   초안 고지 배너 1204×69 @205 · 개인정보 처리방침 카드 1204×2221 @330 ·
//   이용약관 카드 1204×1461 @2623 · 본문 20/40 tracking -0.2 · 제목 Bold, 항목 #404040
//
// ⚠️ Figma 카피를 그대로 옮기되 **줄바꿈 흔적만** 정리했다(디자이너가 수동 줄바꿈하며
//    낱말 사이에 들어간 공백: "보 호법」" · "불 가능한" · "서비스 는" · "반 드시" · "대체 하지").
//    실제 화면은 폭에 따라 다시 흐르므로 그 공백을 남기면 낱말이 깨진다. 그 밖에 명백한
//    오타 3건도 바로잡았다 — `Al 생성`→`AI 생성` · `(이하 회사")`→`(이하 "회사")` ·
//    보호책임자 성명 `000`(가짜 값)→`—`(디자인에도 "지정 확정 후 갱신 예정" 주석이 있다).
// ⚠️ 블록 x 가 190/191/193/194/196/199 로 흘러 있다(Figma 작도 오차) → **190 으로 통일**.
import type { ReactNode } from 'react';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { PublicFooter } from '../../components/shell/PublicFooter';

const Y = (v: number) => v - 122;

/** 본문 한 덩어리 — 제목(Bold) + 이어지는 줄(Regular #404040). 줄 간격은 실측 40. */
function Block({
  fx,
  top,
  width = 1055,
  title,
  lines,
}: {
  fx: string;
  top: number;
  width?: number;
  title?: ReactNode;
  lines: ReactNode[];
}) {
  return (
    <div
      data-fx={fx}
      className="absolute left-[190px] text-[20px] leading-[40px] tracking-[-0.2px]"
      style={{ top: Y(top), width }}
    >
      {title ? <p className="font-bold text-ink-900">{title}</p> : null}
      {lines.map((line, i) => (
        <p key={i} className="text-ink-700">
          {line}
        </p>
      ))}
    </div>
  );
}

/** 처리 위탁 표 — 0.5px #6e6e6e 격자, 열 x 221/555/920, 행 y 1458/1508/1560/1612. */
const OUTSOURCING = [
  ['Supabase Inc.', '데이터 보관·인증 인프라', '대한민국(서울 리전)'],
  ['AI 처리사(LLM)', '대화 질문 생성', '국외 포함(별도 동의)'],
  ['음성 처리사(STT/TTS)', '음성 인식·합성', '국내/국외 포함(별도 동의)'],
];
const COL_X = [221, 555, 920];

export function GuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="relative mx-auto h-[4096px] w-full max-w-[1440px]">
        {/* 초안 고지 */}
        <div
          data-fx="15:320"
          className="absolute left-[117px] h-[69px] w-[1204px] rounded-[10px] border border-ink-400 bg-[#f5f5f5]/50"
          style={{ top: Y(205) }}
        />
        <p
          data-fx="15:321"
          className="absolute left-[273px] w-[893px] text-center text-[20px] leading-[18px] tracking-[-0.2px] text-ink-400"
          style={{ top: Y(231.16) }}
        >
          이 문서는 서비스 구조에 맞춘 <span className="font-bold">초안</span>이며, 외부 법무 자문
          검토 후 확정·시행됩니다. 확정 전 내용은 변경될 수 있습니다.
        </p>

        {/* ── 개인정보 처리방침 ─────────────────────────────────────────── */}
        <section
          id="privacy"
          data-fx="15:324"
          className="absolute left-[118px] h-[2221px] w-[1204px] rounded-[10px] bg-white shadow-card"
          style={{ top: Y(330) }}
          aria-labelledby="privacy-title"
        />
        <h2
          id="privacy-title"
          data-fx="15:319"
          className="absolute left-[190px] whitespace-nowrap text-w-page font-semibold leading-[30px] text-ink-900"
          style={{ top: Y(401) }}
        >
          개인정보 처리방침
        </h2>
        <p
          data-fx="15:336"
          className="absolute left-[190px] w-[1055px] text-[20px] leading-[35px] tracking-[-0.2px] text-ink-700"
          style={{ top: Y(450.32) }}
        >
          리마인드(이하 “회사”)는 인지활동 보조 서비스 “기억온”(이하 “서비스”)을 제공하며,
          「개인정보 보호법」 등 관계 법령에 따라 이용자의 개인정보를 보호합니다. 본 방침은 같은 법
          제30조에 따라 다음 사항을 알려드립니다.
        </p>

        <Block
          fx="15:338"
          top={548}
          title="1. 처리 목적"
          lines={[
            '• 요양보호사 계정 관리(가입·인증·서비스 제공)',
            '• 어르신 개인화 회상 대화 제공(연대기 기반 질문 생성, 음성 대화 진행)',
            '• 세션 기록 제공(대화 전문·요약을 요양보호사·동의된 보호자에게 제공)',
            '• 안전 보호(위기 신호 감지 시 요양보호사 알림 — 의학적 판단이 아닌 안전장치)',
          ]}
        />
        <Block
          fx="15:343"
          top={763}
          title="2. 처리 항목"
          lines={[
            '• 요양보호사(계정): 이름, 이메일, 비밀번호(암호화 저장), 소속 기관·역할',
            '• 어르신(정보주체): 이름, 출생연도, 출신지, 직업, 가족 관계, 주요 기억·취미(연대기), 보호자 성함·관계',
            <>
              •{' '}
              <span className="font-semibold text-ink-900">민감정보(별도 동의)</span>: 대화
              음성(음성 인식 처리 후 정책에 따라 파기), 대화 내용 중 건강 관련 정보
            </>,
            '• 자동 수집: 접속·처리 기록(보안 감사 목적)',
          ]}
        />
        <Block
          fx="15:344"
          top={985}
          title="3. 보유·이용 기간"
          lines={[
            '• 계정 정보: 회원 탈퇴 시까지(탈퇴 시 지체 없이 파기, 법정 보존 항목 제외)',
            '• 어르신 데이터: 서비스 이용 계약(기관) 종료 또는 삭제 요청 시 파기',
            '• 음성 원본: 음성 인식 처리 후 단기 보관 뒤 자동 파기',
            '• 동의 철회 이력: 분쟁 대응을 위해 관련 법정 기간 보존(계정 삭제 시 익명화)',
            '• 접속·처리 기록: 「개인정보의 안전성 확보조치 기준」에 따라 최소 2년 보존',
          ]}
        />
        <Block
          fx="15:345"
          top={1247}
          title="4. 제3자 제공"
          lines={[
            '회사는 정보주체의 별도 동의가 있거나 법령에 근거가 있는 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다. 동의된 보호자에게는 세션 요약이 제공될 수 있습니다.',
          ]}
        />

        {/* 5. 처리 위탁 및 국외 이전 — 제목 + 표 + 주석 */}
        <p
          data-fx="15:346"
          className="absolute left-[190px] w-[1055px] text-[20px] font-bold leading-[40px] tracking-[-0.2px] text-ink-900"
          style={{ top: Y(1389) }}
        >
          5. 처리 위탁 및 국외 이전
        </p>
        <table
          data-fx="15:348"
          className="absolute left-[191px] w-[1055px] table-fixed border-collapse text-[20px] leading-[40px] tracking-[-0.2px]"
          style={{ top: Y(1450) }}
        >
          <colgroup>
            <col style={{ width: COL_X[1] - COL_X[0] }} />
            <col style={{ width: COL_X[2] - COL_X[1] }} />
            <col />
          </colgroup>
          <thead>
            <tr className="h-[52px]">
              {['수탁자', '위탁 업무', '처리 국가'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-[0.5px] border-ink-400 px-[30px] text-left font-semibold text-ink-900"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OUTSOURCING.map((row) => (
              <tr key={row[0]} className="h-[51.5px]">
                {row.map((cell) => (
                  <td key={cell} className="border-[0.5px] border-ink-400 px-[30px] text-ink-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p
          data-fx="15:384"
          className="absolute left-[190px] w-[1055px] text-[20px] leading-[40px] tracking-[-0.2px] text-ink-400"
          style={{ top: Y(1683) }}
        >
          국외 이전이 수반되는 처리는 이전 항목·국가·보유기간을 고지하고 별도 동의를 받습니다.
          수탁자 확정 시 본 표는 갱신됩니다.
        </p>

        <Block
          fx="15:387"
          top={1745}
          title="6. 정보주체의 권리와 행사 방법"
          lines={[
            '• 열람·정정·삭제·처리정지 요구 및 동의 철회: 서비스 내 설정 또는 문의 채널',
            '• 내 데이터 다운로드(이동권): 설정 → 내 데이터 다운로드',
            '• 어르신(정보주체)의 권리는 본인 또는 정당한 대리인(성년후견인 등)이 행사할 수 있습니다.',
          ]}
        />
        <Block
          fx="15:389"
          top={1927}
          width={1050}
          title="7. 파기 절차 및 방법"
          lines={[
            '보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체없이 파기합니다. 전자 파일은 복구 불가능한 방법으로 삭제하며, 자동 파기 스케줄(음성·로그)을 운영합니다.',
          ]}
        />
        <Block
          fx="15:392"
          top={2069}
          width={1050}
          title="8. 안전성 확보 조치"
          lines={[
            '• 데이터 국내 보관(서울 리전), 전송·저장 암호화',
            '• 기관 단위 접근 격리(행 수준 보안), 최소 권한 역할 관리',
            '• 접속·처리 기록 보존(최소 2년) 및 점검, 취약점 점검',
          ]}
        />
        <div id="contact">
          <Block
            fx="15:394"
            top={2251}
            width={1050}
            title="9. 개인정보 보호책임자"
            lines={['성명: — · 직책: 개인정보 보호책임자(CPO) · 문의: privacy@giokon.example']}
          />
          <p
            data-fx="15:396"
            className="absolute left-[190px] w-[231px] text-[20px] leading-[40px] tracking-[-0.2px] text-ink-400"
            style={{ top: Y(2335) }}
          >
            (지정 확정 후 갱신 예정)
          </p>
        </div>
        <Block
          fx="15:398"
          top={2397}
          width={1050}
          title="10. 고지 의무"
          lines={[
            <>
              본 방침이 변경되는 경우 시행 <span className="font-bold">7</span>일 전부터 서비스 내
              공지사항으로 알려드립니다.
            </>,
          ]}
        />

        {/* ── 이용약관 ──────────────────────────────────────────────────── */}
        <section
          id="terms"
          data-fx="15:403"
          className="absolute left-[118px] h-[1461px] w-[1204px] rounded-[10px] bg-white shadow-card"
          style={{ top: Y(2623) }}
          aria-labelledby="terms-title"
        />
        <h2
          id="terms-title"
          data-fx="15:404"
          className="absolute left-[190px] whitespace-nowrap text-w-page font-semibold leading-[30px] text-ink-900"
          style={{ top: Y(2694) }}
        >
          이용약관
        </h2>

        <Block
          fx="15:406"
          top={2744}
          width={1060}
          title="제1조 (목적)"
          lines={[
            '본 약관은 리마인드(이하 “회사”)가 제공하는 인지활동 보조 서비스 “기억온”(이하 “서비스”)의 이용 조건과 회사·이용자 간 권리·의무를 정합니다.',
          ]}
        />
        <p
          data-fx="15:407"
          className="absolute left-[190px] whitespace-nowrap text-[20px] font-bold leading-[40px] tracking-[-0.2px] text-ink-900"
          style={{ top: Y(2893) }}
        >
          제2조 (서비스의 성격 - 비의료 고지)
        </p>
        {/* 비의료 포지셔닝 고지 — accent 10% 박스 (컴플라이언스 상시 노출) */}
        <div
          data-fx="15:440"
          className="absolute left-[190px] h-[128px] w-[1059px] rounded-[10px] border border-accent bg-accent/10"
          style={{ top: Y(2959) }}
        />
        <p
          data-fx="15:438"
          className="absolute left-[227px] w-[987px] text-[20px] font-bold leading-[35px] tracking-[-0.2px] text-ink-900"
          style={{ top: Y(2989), wordBreak: 'keep-all' }}
        >
          기억온은 의료기기가 아니며, 질병의 판정·의학적 소견 제공을 목적으로 하지 않습니다.
          서비스는 어르신의 회상 대화와 정서 지원을 돕는 인지활동 보조 도구이며, 건강에 관한
          판단·상담은 반드시 의료 전문가에게 받으시기 바랍니다.
        </p>

        <Block
          fx="15:408"
          top={3127}
          title="제3조 (계정)"
          lines={[
            '• 요양보호사·기관 관리자는 본인 정보를 정확히 등록해야 합니다.',
            '• 계정 인증 수단은 타인과 공유할 수 없으며, 관리 소홀로 인한 책임은 이용자에게 있습니다.',
            '• 어르신 데이터는 소속 기관에 귀속되며, 담당자 변경 시 기관 내에서 인계됩니다.',
          ]}
        />
        <Block
          fx="15:409"
          top={3321}
          title="제4조 (AI 대화 서비스)"
          lines={[
            '• 대화는 사람이 아닌 AI가 진행하며, 화면에 그 사실을 표시합니다.',
            '• AI 생성 내용에는 오류가 있을 수 있으며, 회사는 지속적으로 품질을 개선합니다.',
            '• 위기 신호 감지 시 요양보호사에게 알림이 전달될 수 있습니다. 이는 안전장치이며 의학적 판단이 아닙니다.',
          ]}
        />
        <Block
          fx="15:431"
          top={3515}
          width={1050}
          title="제5조 (이용자의 의무)"
          lines={[
            '• 어르신 정보 등록 전 필요한 동의(민감정보·국외이전·AI 이용)를 확보해야 합니다.',
            '• 타인의 권리를 침해하거나 서비스를 부정한 목적으로 이용할 수 없습니다.',
          ]}
        />
        <Block
          fx="15:432"
          top={3669}
          width={1050}
          title="제6조 (서비스 변경·중단)"
          lines={[
            '회사는 운영상·기술상 필요에 따라 서비스를 변경할 수 있으며, 중대한 변경은 사전에 공지합니다.',
          ]}
        />
        <Block
          fx="15:435"
          top={3783}
          width={1050}
          title="제7조 (책임의 제한)"
          lines={[
            '회사는 천재지변, 이용자 귀책 사유로 인한 손해에 책임을 지지 않습니다. 서비스는 돌봄 인력을 대체하지 않으며, 응급 상황 대응 의무는 보호자·기관에 있습니다.',
          ]}
        />
        <Block
          fx="15:433"
          top={3937}
          width={1050}
          title="제8조 (분쟁 해결)"
          lines={[
            '서비스 이용과 관련한 분쟁은 상호 협의로 해결하며, 협의가 어려운 경우 관할 법원에 제소할 수 있습니다.',
          ]}
        />
      </main>
      <PublicFooter />
    </div>
  );
}
