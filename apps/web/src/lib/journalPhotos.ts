// 요양일지 사진 — private 버킷(journal-photos)의 경로를 표시용 signed URL 로 바꾼다.
// DB(program_journal_photos.path)에는 경로만 저장한다(elder-photos 와 같은 규약).
//
// ⚠️ Storage 정책이 경로 첫 구간(<profile_id>)으로 기관을 확인한다 → 경로는 반드시
//    `<profile_id>/…` 이고, 어르신을 지우기 전에 파일을 먼저 지워야 한다.
import { useQuery } from '@tanstack/react-query';
import { getGiokonClient } from '@giokon/data';

const BUCKET = 'journal-photos';
const SIGNED_TTL = 60 * 60; // 1시간

/** 여러 경로를 한 번에 서명한다. 반환: 경로 → URL 맵(실패한 건 빠진다). */
export function useJournalPhotoUrls(paths: (string | undefined)[], enabled: boolean) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort();
  return useQuery({
    queryKey: ['journal-photo-urls', unique],
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

/** 고른 파일을 올리고 `program_journal_photos.path` 에 넣을 경로를 돌려준다. */
export async function uploadJournalPhoto(profileId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await getGiokonClient()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** 파일 파기 — 행보다 **먼저** 부른다(정책이 프로필을 경로로 조회한다). */
export async function removeJournalPhotoFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getGiokonClient().storage.from(BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}
