import { PageHeader } from '../components/Layout';

/** 신규 디자인으로 아직 이관되지 않은 화면. 이관이 끝나면 이 컴포넌트는 사라진다. */
export function Pending({ title, node }: { title: string; node: string }) {
  return (
    <>
      <PageHeader title={title} description="이 화면은 신규 디자인으로 이관 중입니다." />
      <div className="rounded-[10px] border border-line bg-white px-[52px] py-16 text-w-body text-ink-500">
        Figma <code className="text-ink-700">{node}</code> 기준으로 구현 예정입니다.
      </div>
    </>
  );
}
