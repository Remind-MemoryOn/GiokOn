// 세션 분석 요약 렌더 (SCR-W07 공용 — 분석 페이지·세션 상세 카드)
//
// core/analysis 의 SessionAnalysis(관찰 지표)를 표시한다.
// ⚠️ 비의료: 효능·향상 판정이 아니라 대화에서 직접 관찰된 지표임을 상시 고지.

import { Hash, Sparkles } from 'lucide-react';
import type { SessionAnalysis } from '@giokon/core';
import { Badge } from './ui/Badge';
import { EMOTION_META } from '../types';
import { cn } from '../lib/utils';

export function AnalysisSummary({
  analysis,
  compact,
}: {
  analysis: SessionAnalysis;
  compact?: boolean;
}) {
  const meta = EMOTION_META[analysis.emotionTone];
  const m = analysis.metrics;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm text-slate-800 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
          {analysis.summary}
        </p>
        <span className={cn('shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border', meta.color)}>
          {meta.emoji} {meta.label}
        </span>
      </div>

      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4')}>
        <Metric label="응답률" value={`${Math.round(m.responseRate * 100)}%`} />
        <Metric label="참여도" value={`${Math.round(m.participation * 100)}%`} />
        <Metric label="어르신 발화" value={`${m.elderTurns}회`} />
        <Metric label="평균 발화 길이" value={`${m.avgUtteranceChars}자`} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {analysis.topicsEngaged.map((t) => (
          <Badge key={`e-${t}`} tone="success">호응 좋음 · {t}</Badge>
        ))}
        {analysis.topicsLow.map((t) => (
          <Badge key={`l-${t}`} tone="neutral">반응 뜸함 · {t}</Badge>
        ))}
        {analysis.interestKeywords.map((k) => (
          <span key={k} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            <Hash size={9} className="inline -mt-0.5" />
            {k}
          </span>
        ))}
      </div>

      {analysis.recommendedTopics.length > 0 ? (
        <div className="flex items-center gap-1.5 text-xs text-purple-700">
          <Sparkles size={13} />
          다음 추천 주제: {analysis.recommendedTopics.join(' · ')}
        </div>
      ) : null}

      <p className="text-[11px] text-slate-400" style={{ wordBreak: 'keep-all' }}>
        대화에서 직접 관찰된 지표입니다(효능·향상 판정이 아닙니다). AI가 생성한 요약입니다.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}
