// 중계 음성(Clova) 재생 — 턴 단위 WAV 파일 재생기(expo-av).
//
// 한 턴의 PCM 청크를 전부 받은 뒤 WAV 로 감싸 캐시 파일로 쓰고 Sound 로 재생한다.
// 재생 완료까지의 Promise 를 돌려준다 — talk 화면의 speaking 파생 상태가 그 시점을
// 기준으로 잠긴다.

import { Audio, type AVPlaybackStatus } from 'expo-av';
// SDK 54 의 expo-file-system 은 새 API(File/Paths)로 바뀌었고, cacheDirectory·
// writeAsStringAsync·EncodingType 은 `/legacy` 진입점으로 옮겨졌다. 여기서는
// 상향의 변경 범위를 좁히려고 legacy 를 쓴다 — expo-av→expo-audio 전환과 함께
// 새 API(File.write 로 Uint8Array 직접 쓰기, base64 왕복 제거)로 옮긴다.
import * as FileSystem from 'expo-file-system/legacy';
import { base64ToBytes, bytesToBase64, wrapWav } from './pcm';

let current: { sound: Audio.Sound; fileUri: string; settle: () => void } | null = null;
let generation = 0;
let cancelPreparation: (() => void) | null = null;
let pendingPreparation: Promise<void> | null = null;
let pendingCleanup: Promise<void> | null = null;
let cleanupFailure: Error | null = null;
export type PlaybackResult = 'completed' | 'interrupted' | 'empty';

function dispose(sound: Audio.Sound | undefined, fileUri: string): void {
  const job = (async () => {
    try { await sound?.unloadAsync(); }
    catch { cleanupFailure = new Error('오디오 정리를 확인하지 못했어요. 앱을 다시 실행해 주세요.'); }
    try { await FileSystem.deleteAsync(fileUri, { idempotent: true }); }
    catch { /* Best effort temporary file deletion; not evidence of native playback. */ }
  })();
  const joined = Promise.all([pendingCleanup, job]).then(() => {});
  pendingCleanup = joined;
  void joined.then(() => { if (pendingCleanup === joined) pendingCleanup = null; });
}

async function waitForCleanup(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (pendingCleanup) await Promise.race([pendingCleanup, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('오디오 정리가 지연되고 있어요. 재생 상태를 확인해 주세요.')), 5000);
    })]);
    if (cleanupFailure) throw cleanupFailure;
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

async function teardown(): Promise<void> {
  if (current) {
    const { sound, fileUri } = current;
    current.settle();
    current = null;
    dispose(sound, fileUri);
  }
  // Timing out does not imply native unload completed. Keep the gate until it does.
  await waitForCleanup();
}

async function waitForPreparation(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (pendingPreparation) await Promise.race([pendingPreparation, new Promise<never>((_, reject) => {
      timer=setTimeout(()=>reject(new Error('오디오 준비 정리가 지연되고 있어요. 잠시 후 다시 시도해 주세요.')),5000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

async function prepareSound(fileUri: string, wav: Uint8Array, ownGeneration: number): Promise<Audio.Sound | null> {
  let cancelled=false;
  let cancel!: () => void;
  const interrupted=new Promise<null>(resolve=>{cancel=()=>{cancelled=true;resolve(null);};});
  cancelPreparation=cancel;
  const stale=()=>cancelled || ownGeneration !== generation;
  const job=(async()=>{
    let sound: Audio.Sound | undefined;
    let delivered=false;
    try {
      await FileSystem.writeAsStringAsync(fileUri, bytesToBase64(wav), { encoding: FileSystem.EncodingType.Base64 });
      if (stale()) return null;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
      if (stale()) return null;
      ({sound}=await Audio.Sound.createAsync({ uri:fileUri }, { shouldPlay:false }, undefined, false));
      if (stale()) return null;
      delivered=true;
      return sound;
    } finally {
      if (!delivered) { dispose(sound,fileUri); await waitForCleanup(); }
    }
  })();
  // Keep the real native job as a gate even if its caller has already returned.
  const pending=job.then(()=>{},()=>{});
  pendingPreparation=pending;
  void pending.then(()=>{if(pendingPreparation===pending) pendingPreparation=null;});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const sound=await Promise.race([job,interrupted,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{cancelled=true;reject(new Error('오디오 준비 시간이 초과됐어요.'));},15000);
    })]);
    if (sound && stale()) { dispose(sound,fileUri); return null; }
    return sound;
  } finally {
    if(timer !== undefined) clearTimeout(timer);
    if(cancelPreparation===cancel) cancelPreparation=null;
  }
}

/**
 * base64 PCM 청크들(순서대로)을 한 턴 음성으로 재생하고 완료를 기다린다.
 * 새 재생이 시작되면 이전 재생은 즉시 중단된다(턴 전환 대응).
 */
export async function playPcmTurn(chunksB64: string[]): Promise<PlaybackResult> {
  const ownGeneration = ++generation;
  cancelPreparation?.();
  await teardown();
  await waitForPreparation();
  await waitForCleanup();
  if (ownGeneration !== generation) return 'interrupted';
  if (chunksB64.length === 0) return 'empty';

  const total = chunksB64.reduce((n, c) => n + base64ToBytes(c).length, 0);
  const pcm = new Uint8Array(total);
  let offset = 0;
  for (const c of chunksB64) {
    const b = base64ToBytes(c);
    pcm.set(b, offset);
    offset += b.length;
  }
  if (total <= 44) return 'empty'; // 사실상 빈 턴

  const wav = wrapWav(pcm);
  const fileUri = `${FileSystem.cacheDirectory}live-turn-${Date.now()}-${ownGeneration}.wav`;
  const sound = await prepareSound(fileUri,wav,ownGeneration);
  if (!sound) return 'interrupted';
  let owned = false;
  try {
    if (ownGeneration !== generation) return 'interrupted';
    const loaded = sound;
    let complete!: () => void;
    let playbackError: Error | undefined;
    let finished = false;
    let terminal = false;
    let observedPlaying = false;
    const done = new Promise<void>(resolve => { complete = resolve; });
    const settle = (completed = false) => {
      if (terminal) return;
      terminal = true; finished = completed; complete();
    };
    current = { sound: loaded, fileUri, settle: () => settle() };
    owned = true;
    loaded.setOnPlaybackStatusUpdate((st: AVPlaybackStatus) => {
      if (terminal) return;
      if (!st.isLoaded && st.error) { playbackError = new Error('음성을 재생하지 못했어요.'); settle(); return; }
      if (!st.isLoaded) return;
      if (st.didJustFinish) { settle(true); return; }
      if (st.isPlaying) observedPlaying = true;
      else if (observedPlaying && st.isPlaying === false && st.isBuffering === false) settle();
    });
    const timer = setTimeout(() => {
      if (!terminal) { playbackError = new Error('음성 재생 시간이 초과됐어요.'); settle(); }
    }, 90000);
    // Native start can remain pending during interruption. Completion/stop/timeout
    // must still settle the caller; the race also consumes a late start rejection.
    try { await Promise.race([loaded.playAsync().then(() => done), done]); }
    finally { clearTimeout(timer); }
    if (playbackError) throw playbackError;
    return ownGeneration === generation && finished ? 'completed' : 'interrupted';
  } finally {
    if (current?.sound === sound) await teardown();
    else if (!owned) {
      dispose(sound, fileUri);
      await waitForCleanup();
    }
  }
}

/** 진행 중 재생이 있으면 즉시 끊는다(세션 종료·다음 턴 시작). */
export async function stopPlayback(): Promise<void> {
  generation++;
  cancelPreparation?.();
  await teardown();
}
