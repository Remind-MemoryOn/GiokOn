// 어르신 사진 — private 버킷(elder-photos) 업로드 + 표시용 signed URL.
//
// DB(profiles.photo_path)에는 **경로만** 저장한다(공개 URL 아님). 표시할 때 signed URL 을
// 발급받아 <Image source={{ uri }}> 로 렌더한다. 경로 규약 `<profile_id>/<uuid>.<ext>`는
// Storage RLS(같은 기관·보호자 배제)가 검증한다. 얼굴 사진은 민감정보 취급.
//
// 발급에 실패하면 null 을 돌려 이니셜 아바타로 폴백한다.

import { useEffect, useState } from 'react';
import { getGiokonClient, removeStorageObject } from '@giokon/data';

const BUCKET = 'elder-photos';
/** signed URL 유효기간(초). 화면 체류 중 만료되지 않을 정도로 넉넉히. */
const SIGNED_TTL = 60 * 60;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64 → 바이트.
 *
 * ⚠️ 예전 구현은 `fetch(file://…)` 로 바이트를 읽었는데, RN 의 fetch 폴리필
 * (whatwg-fetch)은 file:// 응답의 `xhr.status` 가 0 이라 `new Response(body,{status:0})`
 * 에서 RangeError 를 던진다 — 그것도 setTimeout 안이라 **잡히지 않는 Uncaught Error**
 * ("Failed to construct 'Response': The status provided (0) is outside the range
 * [200, 599]") 로 뜨고 업로드 프라미스는 영영 안 풀린다(사용자 기기 재현 2026-08-13).
 * 그래서 파일을 읽지 않고 expo-image-picker 가 바로 주는 base64 를 쓴다.
 */
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length * 3) / 4 - pad);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      (B64.indexOf(clean[i + 2] ?? 'A') << 6) |
      B64.indexOf(clean[i + 3] ?? 'A');
    if (p < out.length) out[p++] = (n >> 16) & 0xff;
    if (p < out.length) out[p++] = (n >> 8) & 0xff;
    if (p < out.length) out[p++] = n & 0xff;
  }
  return out;
}

/** 어르신 사진 입력 — 표시용 로컬 uri + 업로드용 base64(expo-image-picker 결과). */
export interface PickedPhoto {
  uri: string;
  /** picker 가 base64 를 못 준 경우 null → 업로드를 건너뛰고 안내한다. */
  base64: string | null;
}

/**
 * 고른 사진을 업로드하고 저장할 경로를 반환한다.
 * RN 에는 File 이 없어 base64 → Uint8Array 로 바이트를 만들어 올린다.
 */
async function uploadElderPhoto(profileId: string, photo: PickedPhoto): Promise<string> {
  if (!photo.base64) throw new Error('사진을 읽지 못했어요. 다시 선택해 주세요.');
  const ext = (photo.uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const { error } = await getGiokonClient()
    .storage.from(BUCKET)
    .upload(path, base64ToBytes(photo.base64), { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** 로컬 파일 uri 인지(아직 업로드되지 않은 값·구버전 행 방어). */
function isLocalUri(path: string): boolean {
  return /^(file|content|ph|assets-library|data):/.test(path);
}

/** 사진 저장 — Storage 에 올리고 경로를 돌려준다(`profiles.photo_path` 에 넣는다). */
export async function saveElderPhoto(profileId: string, photo: PickedPhoto): Promise<string> {
  return uploadElderPhoto(profileId, photo);
}

/**
 * 이전 사진 파기 — 사진을 **교체한 뒤** 호출한다.
 *
 * 업로드는 매번 새 경로를 만들기 때문에, 지우지 않으면 바꾼 만큼 옛 사진이 Storage 에
 * 계속 쌓인다(감사 지적). 얼굴 사진은 민감정보라 남겨 두면 안 된다.
 * 아직 올리지 않은 로컬 uri 나 빈 값은 지울 대상이 아니다.
 */
export async function removeElderPhoto(photoPath: string | null | undefined): Promise<void> {
  if (!photoPath || isLocalUri(photoPath)) return;
  await removeStorageObject(BUCKET, photoPath);
}

/** 경로 → 표시용 signed URL(발급 실패 시 null). */
async function getElderPhotoUrl(photoPath: string): Promise<string | null> {
  if (isLocalUri(photoPath)) return photoPath;
  const { data, error } = await getGiokonClient()
    .storage.from(BUCKET)
    .createSignedUrl(photoPath, SIGNED_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * 사진 경로를 표시용 URL 로 바꿔 주는 훅. 경로가 없거나 발급 실패면 null →
 * 호출부는 이니셜 아바타로 폴백한다.
 */
export function useElderPhotoUrl(photoPath: string | undefined): string | null {
  // 경로별로 캐시하고 결과를 **파생**한다(effect 안에서 동기 setState 하지 않기 위함 —
  // 경로가 없거나 바뀌면 아래 반환식이 자동으로 null 이 된다).
  const [fetched, setFetched] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!photoPath) return;
    if (fetched?.path === photoPath) return; // 이미 이 경로로 발급 완료
    let active = true;
    getElderPhotoUrl(photoPath)
      .then((u) => {
        if (active) setFetched({ path: photoPath, url: u });
      })
      .catch(() => {
        if (active) setFetched({ path: photoPath, url: null });
      });
    return () => {
      active = false;
    };
  }, [photoPath, fetched]);

  return photoPath && fetched?.path === photoPath ? fetched.url : null;
}
