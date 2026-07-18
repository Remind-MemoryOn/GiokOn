// 요양일지 사진 업로드 (T19.1 — Storage journal-photos, private)
//
// 경로 규약: <profile_id>/<uuid>.<확장자> — Storage RLS 가 기관 소속을 검증한다.
// 사진 원본은 민감정보 취급(보관·파기 정책 적용, docs/compliance.md §5).

import { getGiokonClient } from '@giokon/data';

export async function uploadJournalPhoto(profileId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${profileId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getGiokonClient()
    .storage.from('journal-photos')
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}
