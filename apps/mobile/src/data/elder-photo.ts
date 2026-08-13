// 어르신 사진 — private 버킷(elder-photos) 업로드 + 표시용 signed URL.
//
// DB(profiles.photo_path)에는 **경로만** 저장한다(공개 URL 아님). 표시할 때 signed URL 을
// 발급받아 <Image source={{ uri }}> 로 렌더한다. 경로 규약 `<profile_id>/<uuid>.<ext>`는
// Storage RLS(같은 기관·보호자 배제)가 검증한다. 얼굴 사진은 민감정보 취급.
//
// 미설정(목업) 모드에서는 Supabase 를 호출하지 않고 null 을 돌려 이니셜 아바타로 폴백한다.

import { useEffect, useState } from 'react';
import { getGiokonClient } from '@giokon/data';
import { isSupabaseConfigured } from '../lib/supabase';

const BUCKET = 'elder-photos';
/** signed URL 유효기간(초). 화면 체류 중 만료되지 않을 정도로 넉넉히. */
const SIGNED_TTL = 60 * 60;

/**
 * 로컬 파일(expo-image-picker 결과 uri)을 업로드하고 저장할 경로를 반환한다.
 * RN 에는 File 이 없어 fetch→ArrayBuffer 로 바이트를 만들어 올린다.
 */
export async function uploadElderPhoto(profileId: string, localUri: string): Promise<string> {
  const ext = (localUri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const res = await fetch(localUri);
  const bytes = await res.arrayBuffer();

  const { error } = await getGiokonClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** 로컬 파일 uri 인지(목업 모드에서는 경로 대신 로컬 uri 를 그대로 보관한다). */
function isLocalUri(path: string): boolean {
  return /^(file|content|ph|assets-library|data):/.test(path);
}

/**
 * 사진 저장 — 설정 시 Storage 에 올리고 경로를, 미설정(목업)이면 로컬 uri 를 그대로
 * 돌려준다. 반환값을 `profiles.photo_path`(또는 목업 elder.photoPath)에 넣는다.
 */
export async function saveElderPhoto(profileId: string, localUri: string): Promise<string> {
  if (!isSupabaseConfigured) return localUri;
  return uploadElderPhoto(profileId, localUri);
}

/** 경로 → 표시용 signed URL(실패·미설정 시 null). */
export async function getElderPhotoUrl(photoPath: string): Promise<string | null> {
  if (isLocalUri(photoPath)) return photoPath;
  if (!isSupabaseConfigured) return null;
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
    if (!photoPath || !isSupabaseConfigured) return;
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
