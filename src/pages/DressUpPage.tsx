import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save, Shirt } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ElderCharacter } from '../components/ElderCharacter';
import { useStore } from '../store/store';
import {
  ACCESSORY_OPTIONS,
  BACKGROUND_OPTIONS,
  DEFAULT_APPEARANCE,
  HAIR_OPTIONS,
  OUTFIT_OPTIONS,
  SKIN_OPTIONS,
  type AccessoryId,
  type AppearanceOptionMeta,
  type BackgroundId,
  type CharacterAppearance,
  type HairStyle,
  type OutfitId,
  type SkinTone,
} from '../types';
import { cn } from '../lib/utils';

type SlotKey = 'skin' | 'hair' | 'outfit' | 'accessory' | 'background';

const SLOTS: { key: SlotKey; label: string; emoji: string }[] = [
  { key: 'skin',       label: '피부색', emoji: '🌝' },
  { key: 'hair',       label: '머리',   emoji: '💇' },
  { key: 'outfit',     label: '옷',     emoji: '👘' },
  { key: 'accessory',  label: '소품',   emoji: '👓' },
  { key: 'background', label: '배경',   emoji: '🌸' },
];

export function DressUpPage() {
  const { elderId = '' } = useParams();
  const navigate = useNavigate();

  const elders = useStore((s) => s.elders);
  const upsertElder = useStore((s) => s.upsertElder);
  const toast = useStore((s) => s.toast);

  const elder = useMemo(() => elders.find((e) => e.id === elderId), [elders, elderId]);

  const [appearance, setAppearance] = useState<CharacterAppearance>(
    elder?.appearance || DEFAULT_APPEARANCE
  );
  const [activeSlot, setActiveSlot] = useState<SlotKey>('hair');
  const [preview, setPreview] = useState(true);

  useEffect(() => {
    if (elder?.appearance) setAppearance(elder.appearance);
  }, [elder?.id]);

  if (!elder) {
    return (
      <div className="p-8">
        <Button variant="ghost" onClick={() => navigate('/caregiver/elders')}>
          <ArrowLeft size={14} /> 어르신 목록
        </Button>
      </div>
    );
  }

  function update<K extends keyof CharacterAppearance>(k: K, v: CharacterAppearance[K]) {
    setAppearance((a) => ({ ...a, [k]: v }));
  }

  function save() {
    upsertElder({
      id: elder!.id,
      name: elder!.name,
      birthYear: elder!.birthYear,
      hometown: elder!.hometown,
      job: elder!.job,
      family: elder!.family,
      hobbies: elder!.hobbies,
      guardian: elder!.guardian,
      appearance,
    });
    toast('success', `${elder!.name} 어르신의 모습을 저장했어요.`);
    navigate(`/caregiver/elders/${elder!.id}`);
  }

  function reset() {
    setAppearance(DEFAULT_APPEARANCE);
  }

  return (
    <>
      <PageHeader
        title="캐릭터 꾸미기"
        description={`${elder.name} 어르신의 모습을 만들어 주세요. 대화 화면에 함께 나타납니다.`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(`/caregiver/elders/${elder.id}`)}>
              <ArrowLeft size={14} /> 돌아가기
            </Button>
            <Button variant="outline" onClick={reset}>
              <RefreshCw size={14} /> 기본값
            </Button>
            <Button onClick={save}>
              <Save size={14} /> 저장
            </Button>
          </>
        }
      />
      <div className="flex-1 px-8 py-6 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* 미리보기 */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-b from-slate-50 to-slate-100 p-6 flex flex-col items-center">
                <div className="rounded-3xl overflow-hidden shadow-warm border-4 border-white">
                  <ElderCharacter appearance={appearance} size={280} speaking={preview} />
                </div>
                <div className="mt-5 text-center">
                  <div className="text-lg font-bold text-slate-900">{elder.name}</div>
                  <div className="text-sm text-slate-500">{elder.birthYear}년생</div>
                </div>
                <button
                  onClick={() => setPreview((p) => !p)}
                  className="mt-4 text-xs text-slate-500 hover:text-slate-700 font-semibold"
                >
                  {preview ? '⏸ 말하기 미리보기 중지' : '▶ 말하기 미리보기'}
                </button>
              </div>
            </Card>
            <Card className="mt-4">
              <div className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warm-100 text-warm-700 flex items-center justify-center">
                  <Shirt size={18} />
                </div>
                <div className="text-xs text-slate-600 leading-relaxed">
                  설정한 모습은 어르신 대화 화면에 캐릭터로 표시되고, 보호자 화면에도 그대로 보입니다.
                </div>
              </div>
            </Card>
          </div>

          {/* 슬롯 선택 */}
          <div className="lg:col-span-3 space-y-4">
            {/* 슬롯 탭 */}
            <Card>
              <div className="p-2 flex gap-1 overflow-x-auto">
                {SLOTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setActiveSlot(s.key)}
                    className={cn(
                      'flex-1 min-w-[80px] flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold transition',
                      activeSlot === s.key
                        ? 'bg-warm-500 text-white shadow-soft'
                        : 'text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <span className="text-xl">{s.emoji}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </Card>

            {/* 옵션 그리드 */}
            <Card>
              <div className="p-5">
                {activeSlot === 'skin' ? (
                  <OptionGrid
                    options={SKIN_OPTIONS}
                    current={appearance.skin}
                    onSelect={(v) => update('skin', v as SkinTone)}
                    renderPreview={(o) => <SkinPreview tone={o.id as SkinTone} />}
                  />
                ) : null}
                {activeSlot === 'hair' ? (
                  <OptionGrid
                    options={HAIR_OPTIONS}
                    current={appearance.hair}
                    onSelect={(v) => update('hair', v as HairStyle)}
                    renderPreview={(o) => (
                      <MiniCharacter override={{ hair: o.id as HairStyle }} appearance={appearance} />
                    )}
                  />
                ) : null}
                {activeSlot === 'outfit' ? (
                  <OptionGrid
                    options={OUTFIT_OPTIONS}
                    current={appearance.outfit}
                    onSelect={(v) => update('outfit', v as OutfitId)}
                    renderPreview={(o) => (
                      <MiniCharacter override={{ outfit: o.id as OutfitId }} appearance={appearance} />
                    )}
                  />
                ) : null}
                {activeSlot === 'accessory' ? (
                  <OptionGrid
                    options={ACCESSORY_OPTIONS}
                    current={appearance.accessory}
                    onSelect={(v) => update('accessory', v as AccessoryId)}
                    renderPreview={(o) => (
                      <MiniCharacter
                        override={{ accessory: o.id as AccessoryId }}
                        appearance={appearance}
                      />
                    )}
                  />
                ) : null}
                {activeSlot === 'background' ? (
                  <OptionGrid
                    options={BACKGROUND_OPTIONS}
                    current={appearance.background}
                    onSelect={(v) => update('background', v as BackgroundId)}
                    renderPreview={(o) => (
                      <MiniCharacter
                        override={{ background: o.id as BackgroundId }}
                        appearance={appearance}
                      />
                    )}
                  />
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function OptionGrid<T extends string>({
  options,
  current,
  onSelect,
  renderPreview,
}: {
  options: AppearanceOptionMeta<T>[];
  current: T;
  onSelect: (id: T) => void;
  renderPreview: (o: AppearanceOptionMeta<T>) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          className={cn(
            'group rounded-2xl border-2 p-3 flex flex-col items-center gap-2 transition',
            current === o.id
              ? 'border-warm-500 bg-warm-50 shadow-soft'
              : 'border-slate-200 bg-white hover:border-warm-300 hover:bg-slate-50'
          )}
        >
          <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
            {renderPreview(o)}
          </div>
          <div className="text-xs font-semibold text-slate-700 text-center">
            {o.preview ? <span className="mr-1">{o.preview}</span> : null}
            {o.label}
          </div>
        </button>
      ))}
    </div>
  );
}

function SkinPreview({ tone }: { tone: SkinTone }) {
  const color =
    tone === 'light' ? '#fde2c8' : tone === 'tan' ? '#dfb593' : '#fbc8b4';
  return (
    <div className="w-20 h-20 flex items-center justify-center">
      <div
        className="w-14 h-14 rounded-full shadow-inner border border-white/60"
        style={{ background: color }}
      />
    </div>
  );
}

function MiniCharacter({
  appearance,
  override,
}: {
  appearance: CharacterAppearance;
  override: Partial<CharacterAppearance>;
}) {
  const merged: CharacterAppearance = { ...appearance, ...override };
  return (
    <div className="w-20 h-24 flex items-center justify-center">
      <ElderCharacter appearance={merged} size={96} />
    </div>
  );
}
