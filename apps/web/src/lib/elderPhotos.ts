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
