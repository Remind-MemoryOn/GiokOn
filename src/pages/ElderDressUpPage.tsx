import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Heart, Sparkles } from 'lucide-react';
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

type SlotKey = 'hair' | 'outfit' | 'accessory' | 'background' | 'skin';

const SLOTS: { key: SlotKey; label: string; emoji: string }[] = [
  { key: 'hair',       label: '머리',   emoji: '💇' },
  { key: 'outfit',     label: '옷',     emoji: '👘' },
  { key: 'accessory',  label: '소품',   emoji: '👓' },
  { key: 'background', label: '배경',   emoji: '🌸' },
  { key: 'skin',       label: '얼굴빛', emoji: '🌝' },
];

export function ElderDressUpPage() {
  const { elderId = '' } = useParams();
  const navigate = useNavigate();

  const elders = useStore((s) => s.elders);
  const upsertElder = useStore((s) => s.upsertElder);
  const toast = useStore((s) => s.toast);

  const elder = useMemo(() => elders.find((e) => e.id === elderId), [elders, elderId]);

  const [appearance, setAppearance] = useState<CharacterAppearance>(
    elder?.appearance || DEFAULT_APPEARANCE
  );
  const [activeSlot, setActiveSlot] = useState<SlotKey>('outfit');
  const [waveAnim, setWaveAnim] = useState(false);

  useEffect(() => {
    if (elder?.appearance) setAppearance(elder.appearance);
  }, [elder?.id]);

  if (!elder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100 p-8">
        <button
          onClick={() => navigate('/elder')}
          className="text-elder-sm bg-warm-500 text-white px-8 py-4 rounded-2xl"
        >
          돌아가기
        </button>
      </div>
    );
  }

  function update<K extends keyof CharacterAppearance>(k: K, v: CharacterAppearance[K]) {
    setAppearance((a) => ({ ...a, [k]: v }));
    // 살짝 인터랙션 — 옷을 바꿀 때마다 캐릭터가 손 흔들듯이
    setWaveAnim(true);
    setTimeout(() => setWaveAnim(false), 500);
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
    toast('success', '예쁘게 잘 꾸미셨어요!');
    navigate(`/elder/${elder!.id}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-warm-100/40 to-warm-200/40 flex flex-col">
      {/* 상단 */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between bg-cream-50/80 backdrop-blur border-b border-warm-200/50">
        <button
          onClick={() => navigate(`/elder/${elder.id}`)}
          className="flex items-center gap-2 text-base text-warm-700 hover:text-warm-900 font-semibold"
        >
          <ArrowLeft size={20} /> 돌아가기
        </button>
        <div className="text-elder-sm font-bold text-warm-900 flex items-center gap-2">
          <Sparkles size={20} className="text-warm-500" />
          나만의 캐릭터 꾸미기
        </div>
        <button
          onClick={save}
          className="flex items-center gap-2 text-elder-sm font-bold bg-warm-500 hover:bg-warm-600 text-white px-6 py-3 rounded-2xl shadow-warm transition active:scale-95"
        >
          <Check size={22} />
          완성
        </button>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 sm:p-10">
        {/* 캐릭터 미리보기 — 큰 화면 */}
        <section className="lg:w-2/5 flex flex-col items-center">
          <div className={cn(
            'rounded-3xl overflow-hidden shadow-warm border-4 border-white bg-white',
            waveAnim ? 'animate-gentle-bounce' : ''
          )}>
            <ElderCharacter appearance={appearance} size={320} speaking={waveAnim} />
          </div>
          <div className="mt-5 text-center">
            <div className="text-elder-base font-bold text-warm-900">{elder.name} 어르신</div>
            <div className="text-base text-warm-600 mt-1 flex items-center gap-1 justify-center">
              <Heart size={16} className="text-rose-400" fill="currentColor" />
              나의 친구
            </div>
          </div>
        </section>

        {/* 옷장 */}
        <section className="lg:flex-1 flex flex-col gap-4">
          {/* 슬롯 큰 버튼들 */}
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {SLOTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSlot(s.key)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl py-4 px-2 transition shadow-soft active:scale-95',
                  activeSlot === s.key
                    ? 'bg-warm-500 text-white shadow-warm scale-105'
                    : 'bg-white text-warm-800 border-2 border-warm-200 hover:border-warm-400'
                )}
              >
                <span className="text-3xl sm:text-4xl">{s.emoji}</span>
                <span className="text-sm sm:text-base font-bold">{s.label}</span>
              </button>
            ))}
          </div>

          {/* 옵션 */}
          <div className="flex-1 bg-white rounded-3xl border-2 border-warm-200 shadow-soft p-5 sm:p-6">
            <div className="text-elder-sm font-bold text-warm-900 mb-4">
              {SLOTS.find((s) => s.key === activeSlot)?.emoji} 마음에 드는 걸로 골라주세요
            </div>

            {activeSlot === 'hair' ? (
              <BigOptionGrid
                options={HAIR_OPTIONS}
                current={appearance.hair}
                onSelect={(v) => update('hair', v as HairStyle)}
                appearance={appearance}
                overrideKey="hair"
              />
            ) : null}
            {activeSlot === 'outfit' ? (
              <BigOptionGrid
                options={OUTFIT_OPTIONS}
                current={appearance.outfit}
                onSelect={(v) => update('outfit', v as OutfitId)}
                appearance={appearance}
                overrideKey="outfit"
              />
            ) : null}
            {activeSlot === 'accessory' ? (
              <BigOptionGrid
                options={ACCESSORY_OPTIONS}
                current={appearance.accessory}
                onSelect={(v) => update('accessory', v as AccessoryId)}
                appearance={appearance}
                overrideKey="accessory"
              />
            ) : null}
            {activeSlot === 'background' ? (
              <BigOptionGrid
                options={BACKGROUND_OPTIONS}
                current={appearance.background}
                onSelect={(v) => update('background', v as BackgroundId)}
                appearance={appearance}
                overrideKey="background"
              />
            ) : null}
            {activeSlot === 'skin' ? (
              <BigOptionGrid
                options={SKIN_OPTIONS}
                current={appearance.skin}
                onSelect={(v) => update('skin', v as SkinTone)}
                appearance={appearance}
                overrideKey="skin"
              />
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function BigOptionGrid<T extends string, K extends keyof CharacterAppearance>({
  options,
  current,
  onSelect,
  appearance,
  overrideKey,
}: {
  options: AppearanceOptionMeta<T>[];
  current: T;
  onSelect: (id: T) => void;
  appearance: CharacterAppearance;
  overrideKey: K;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      {options.map((o) => {
        const merged: CharacterAppearance = {
          ...appearance,
          [overrideKey]: o.id,
        } as CharacterAppearance;
        const selected = current === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onSelect(o.id)}
            className={cn(
              'relative rounded-2xl border-2 p-3 flex flex-col items-center gap-2 transition active:scale-95',
              selected
                ? 'border-warm-500 bg-warm-50 shadow-warm'
                : 'border-warm-200 bg-white hover:border-warm-400'
            )}
          >
            <div className="rounded-xl overflow-hidden bg-slate-50">
              <ElderCharacter appearance={merged} size={120} />
            </div>
            <div className="text-base font-bold text-warm-800 text-center">
              {o.preview ? <span className="mr-1">{o.preview}</span> : null}
              {o.label}
            </div>
            {selected ? (
              <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-warm-500 text-white flex items-center justify-center shadow-soft">
                <Check size={16} />
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
