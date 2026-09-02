import { Link } from 'react-router-dom';
import { asset } from '../../assets/ui';

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-[#f8f8f8]">
      <div className="mx-auto flex min-h-[190px] w-full max-w-[1204px] items-start justify-between py-12">
        <div>
          <img src={asset.wordmark} alt="기억온" width={137} height={21} />
          <p className="mt-5 text-w-label leading-6 text-ink-500">AI 회상 대화와 돌봄 기록을 관리하는 인지활동 보조 서비스</p>
        </div>
        <nav aria-label="법적 고지" className="flex gap-8 text-w-label font-semibold text-ink-500">
          <Link to="/privacy" className="hover:text-accent">개인정보 처리방침</Link>
          <Link to="/terms" className="hover:text-accent">이용약관</Link>
        </nav>
      </div>
    </footer>
  );
}
