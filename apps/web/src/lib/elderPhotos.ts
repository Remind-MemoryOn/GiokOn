// 어르신 사진 — private 버킷(elder-photos)의 경로를 표시용 signed URL 로 바꾼다.
// DB(profiles.photo_path)에는 경로만 저장한다(앱과 동일 규약, apps/mobile/src/data/elder-photo.ts).
// 신규 디자인은 목록·상세·타임라인 전반에 사진을 쓰므로 웹에도 배선한다.

import { useQuery } from '@tanstack/react-query';
import { getGiokonClient } from '@giokon/data';

const BUCKET = 'elder-photos';
const SIGNED_TTL = 60 * 60; // 1시간

/** 여러 경로를 한 번에 서명한다. 반환: 경로 → URL 맵(실패한 건 빠진다). */
export function useElderPhotoUrls(paths: (string | undefined)[], enabled: boolean) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort();
  return useQuery({
    queryKey: ['elder-photo-urls', unique],
    enabled: enabled && unique.length > 0,
    staleTime: (SIGNED_TTL - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .storage.from(BUCKET)
        .createSignedUrls(unique, SIGNED_TTL);
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      }
      return map;
    },
  });
}

/**
 * 고른 파일을 private 버킷에 올리고 `profiles.photo_path` 에 넣을 경로를 돌려준다.
 *
 * ⚠️ Storage 정책이 경로의 profile_id 로 `profiles` 를 조회하므로 **행이 먼저 있어야**
 * 올라간다(등록은 프로필 insert → 업로드 → photo_path 갱신 순서).
 */
export async function uploadElderPhoto(profileId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await getGiokonClient()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
