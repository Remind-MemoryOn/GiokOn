// 분석 페이지 (SCR-W07 — T16.4 / Phase W3)
//
// 앱에서 대화가 종료되면 자동 분석(core/analysis 관찰 지표)이 저장되고,
// Realtime(T-E3)으로 이 화면에 즉시 나타난다. 개인/전체 필터 제공.
// ⚠️ 비의료: 관찰 지표만 표시(효능·향상 판정 금지 — 카피 린트 대상).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartColumn, RadioTower } from 'lucide-react';
import {
  parseSessionAnalysis,
  toElderProfile,
  useOrgSessionAnalyses,
  useProfiles,
} from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { AnalysisSummary } from '../components/AnalysisSummary';
import { Card, CardBody } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../auth/AuthProvider';
import { formatKoreanDateTime } from '../lib/utils';
import { cn } from '../lib/utils';

export function AnalysisPage() {
  const { isConfigured } = useAuth();
  const profilesQuery = useProfiles();
  const analysesQuery = useOrgSessionAnalyses({ enabled: isConfigured });
  const [filterId, setFilterId] = useState<string | 'all'>('all');

  const elders = (profilesQuery.data ?? []).map(toElderProfile);
  const analyses = (analysesQuery.data ?? []).filter(
    (a) => filterId === 'all' || a.profile_id === filterId,
  );

  return (
    <>
      <PageHeader
        title="분석"
        description="앱 대화가 끝나면 세션별 관찰 지표(참여·응답·주제 반응)가 실시간으로 도착합니다."
      />
      <div className="flex-1 px-8 py-6 space-y-5 overflow-y-auto">
        {!isConfigured ? (
          <Card>
            <CardBody className="py-16 text-center text-sm text-slate-500">
              Supabase 연동 후 앱 대화 분석이 표시됩니다.
            </CardBody>
          </Card>
        ) : (
          <>
            {/* 어르신 필터 */}
            <div className="flex items-center gap-2 flex-wrap">
              <FilterChip active={filterId === 'all'} onClick={() => setFilterId('all')}>
                전체
              </FilterChip>
              {elders.map((e) => (
                <FilterChip
                  key={e.id}
                  active={filterId === e.id}
                  onClick={() => setFilterId(e.id)}
                >
                  {e.name}
                </FilterChip>
              ))}
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-emerald-600">
                <RadioTower size={12} /> 실시간 반영
              </span>
            </div>

            {analysesQuery.isLoading ? (
              <Card>
                <CardBody className="py-16 text-center text-sm text-slate-500">
                  불러오는 중...
                </CardBody>
              </Card>
            ) : analyses.length === 0 ? (
              <Card>
                <CardBody className="py-16 text-center text-sm text-slate-500" style={{ wordBreak: 'keep-all' }}>
                  아직 도착한 분석이 없어요. 앱에서 세션을 진행하면 종료와 동시에
                  이곳에 나타납니다.
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-4">
                {analyses.map((row) => {
                  const parsed = parseSessionAnalysis(row);
                  const elder = elders.find((e) => e.id === row.profile_id);
                  return (
                    <Card key={row.id}>
                      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
                        <Avatar name={elder?.name ?? '?'} color={elder?.avatarColor} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {elder?.name ?? '알 수 없음'}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {formatKoreanDateTime(row.created_at)}
                          </div>
                        </div>
                        <Link
                          to={`/caregiver/logs/${row.session_id}`}
                          className="text-xs text-warm-700 hover:underline shrink-0"
                        >
                          대화 전문 보기
                        </Link>
                      </div>
                      <CardBody>
                        {parsed ? (
                          <AnalysisSummary analysis={parsed} />
                        ) : (
                          <div className="text-sm text-slate-500 flex items-center gap-2">
                            <ChartColumn size={15} /> 분석 형식을 해석할 수 없습니다(버전 {row.version}).
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-semibold border transition',
        active
          ? 'bg-warm-500 text-white border-warm-500'
          : 'bg-white text-slate-600 border-slate-200 hover:border-warm-300',
      )}
    >
      {children}
    </button>
  );
}
