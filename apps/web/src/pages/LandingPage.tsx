import { Link } from 'react-router-dom';
import { Brain, Users, Heart, Sparkles, ArrowRight, MessageCircle } from 'lucide-react';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-warm-100/40 to-warm-200/30 flex flex-col">
      <header className="px-6 sm:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-warm-500 flex items-center justify-center shadow-warm">
            <Brain size={22} className="text-white" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight text-slate-900">기억온</div>
            <div className="text-xs text-warm-700">GiokOn · 회상 대화 AI</div>
          </div>
        </div>
        <span className="text-xs text-warm-700 bg-white/70 px-3 py-1.5 rounded-full border border-warm-200">
          프로토타입
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-12">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-warm-200/60 border border-warm-300 text-xs font-semibold text-warm-800 mb-5">
              <Sparkles size={13} />
              어르신의 기억과 함께하는 AI
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight mb-4"
              style={{ wordBreak: 'keep-all' }}
            >
              요양보호사가 설계하고,<br />
              <span className="text-warm-600">AI가 어르신과 대화합니다.</span>
            </h1>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed" style={{ wordBreak: 'keep-all' }}>
              대화할수록 어르신을 더 깊이 알아가고, 보호자에게는 오늘의 마음을 전해드려요.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 요양보호사 */}
            <Link
              to="/caregiver/login"
              className="group bg-white rounded-3xl border border-slate-200 hover:border-warm-300 hover:shadow-warm transition p-7 sm:p-8"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Users size={26} />
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">요양보호사</div>
                  <div className="text-sm text-slate-500">관리·세션 진행</div>
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-5" style={{ wordBreak: 'keep-all' }}>
                담당 어르신을 직접 선택하고, 활동 세션을 시작합니다. 캐릭터 꾸미기·대화 기록·보호자 리포트까지 모두 관리할 수 있어요.
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 group-hover:gap-2.5 transition-all">
                로그인하고 시작하기 <ArrowRight size={15} />
              </span>
            </Link>

            {/* 보호자 */}
            <Link
              to="/guardian/login"
              className="group bg-gradient-to-br from-violet-50 to-rose-50 rounded-3xl border border-violet-200 hover:border-violet-300 hover:shadow-warm transition p-7 sm:p-8"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-white text-violet-600 flex items-center justify-center shadow-soft">
                  <MessageCircle size={26} />
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">보호자</div>
                  <div className="text-sm text-violet-700">부모님 마음 살피기</div>
                </div>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed mb-5" style={{ wordBreak: 'keep-all' }}>
                오늘 부모님께서 어떤 이야기를 하셨는지, 어떤 기분이셨는지 확인하고 통화·방문 시 참고할 수 있는 대화 가이드를 받으세요.
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-violet-700 group-hover:gap-2.5 transition-all">
                보호자로 로그인 <ArrowRight size={15} />
              </span>
            </Link>
          </div>

          <div className="mt-6 rounded-2xl bg-white/60 border border-warm-200 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-warm-200 text-warm-700 flex items-center justify-center shrink-0">
              <Heart size={18} />
            </div>
            <div className="text-sm text-slate-700 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
              <strong>어르신은 직접 로그인하지 않습니다.</strong> 요양보호사가 어르신을 선택하고 세션을 시작하면 태블릿에 큰 화면으로 대화가 자동 진행됩니다.
            </div>
          </div>

          <div className="text-center mt-10 text-xs text-warm-700/70">
            실제 시연은 태블릿(아이패드·갤탭) 가로 모드를 권장합니다.
          </div>
        </div>
      </main>
    </div>
  );
}
