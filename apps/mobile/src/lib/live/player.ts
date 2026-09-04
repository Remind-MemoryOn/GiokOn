// Live API 오디오 재생 — 턴 단위 WAV 파일 재생기(expo-av).
//
// 한 턴의 PCM 청크를 전부 받은 뒤 WAV 로 감싸 캐시 파일로 쓰고 Sound 로 재생한다.
// 재생 완료까지의 Promise 를 돌려준다 — talk 화면의 speaking 파생 상태가 그 시점을
// 기준으로 잠긴다(기존 expo-speech 흐름과 동일한 계약).

import { Audio, type AVPlaybackStatus } from 'expo-av';
// SDK 54 의 expo-file-system 은 새 API(File/Paths)로 바뀌었고, cacheDirectory·
// writeAsStringAsync·EncodingType 은 `/legacy` 진입점으로 옮겨졌다. 여기서는
// 상향의 변경 범위를 좁히려고 legacy 를 쓴다 — expo-av→expo-audio 전환과 함께
// 새 API(File.write 로 Uint8Array 직접 쓰기, base64 왕복 제거)로 옮긴다.
import * as FileSystem from 'expo-file-system/legacy';
import { base64ToBytes, bytesToBase64, wrapWav } from './pcm';

let current: { sound: Audio.Sound; fileUri: string } | null = null;

async function teardown(): Promise<void> {
  if (!current) return;
  const { sound, fileUri } = current;
  current = null;
  try {
    await sound.unloadAsync();
  } catch {
    /* 이미 내려간 경우 무시 */
  }
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    /* 정리 실패는 치명적이지 않다 */
  }
}

/**
 * base64 PCM 청크들(순서대로)을 한 턴 음성으로 재생하고 완료를 기다린다.
 * 새 재생이 시작되면 이전 재생은 즉시 중단된다(턴 전환 대응).
 */
export async function playPcmTurn(chunksB64: string[]): Promise<void> {
  await stopPlayback();
  if (chunksB64.length === 0) return;

  const total = chunksB64.reduce((n, c) => n + base64ToBytes(c).length, 0);
  const pcm = new Uint8Array(total);
  let offset = 0;
  for (const c of chunksB64) {
    const b = base64ToBytes(c);
    pcm.set(b, offset);
    offset += b.length;
  }
  if (total <= 44) return; // 사실상 빈 턴

  const wav = wrapWav(pcm);
  const fileUri = `${FileSystem.cacheDirectory}live-turn.wav`;
  await FileSystem.writeAsStringAsync(fileUri, bytesToBase64(wav), {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
  const { sound } = await Audio.Sound.createAsync(
    { uri: fileUri },
    { shouldPlay: true },
    undefined,
    false,
  );
  current = { sound, fileUri };
  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((st: AVPlaybackStatus) => {
      if (!st.isLoaded && st.error) resolve();
      if (st.isLoaded && st.didJustFinish) resolve();
    });
  });
  await teardown();
}

/** 진행 중 재생이 있으면 즉시 끊는다(세션 종료·다음 턴 시작). */
export async function stopPlayback(): Promise<void> {
  await teardown();
}
