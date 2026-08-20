import { PublicHeader } from '../../components/shell/PublicHeader';

/** 서비스 소개 (Figma 1:13) — 이관 중. */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1440px] px-[130px] py-24">
        <p className="text-w-body text-ink-500">
          서비스 소개 화면은 신규 디자인(Figma 1:13)으로 이관 중입니다.
        </p>
      </main>
    </div>
  );
}
