// @giokon/data — 어르신 관련 Storage 파일 파기
//
// 어르신 사진(elder-photos)과 프로그램 일지 사진(journal-photos — 버킷 이름은 요양일지 시절 그대로)은 둘 다 private 버킷이고
// 경로 규약이 `<profile_id>/<파일명>` 이다. DB 행은 profiles 를 지우면 FK cascade 로
// 함께 사라지지만 **Storage 객체는 cascade 되지 않는다** — 지금까지 사진은 계속 남아
// 있었다(사진 교체 시 이전 파일도 그대로 남았다). 얼굴 사진은 민감정보라 파기가 필요하다.
//
// ⚠️ 순서 규약: Storage RLS(elder_photos_delete_org · journal_photos_delete_org)는
//    경로 첫 구간을 profile_id 로 보고 `public.profiles` 에서 기관을 확인한다.
//    따라서 **프로필 행을 먼저 지우면 그 어르신의 파일을 더 이상 지울 수 없다.**
//    반드시 Storage → DB 순서로 파기한다(deleteElderWithFiles 가 그 순서를 강제한다).

import { getGiokonClient } from './client'

export const ELDER_PHOTO_BUCKET = 'elder-photos'
export const JOURNAL_PHOTO_BUCKET = 'journal-photos'

/** 한 번에 나열하는 파일 수(버킷당 어르신 파일은 보통 몇 개 수준). */
const LIST_PAGE = 100

/** 파일 1개 삭제(없으면 조용히 넘어간다). */
export async function removeStorageObject(bucket: string, path: string): Promise<void> {
  const { error } = await getGiokonClient().storage.from(bucket).remove([path])
  if (error) throw new Error(error.message)
}

/** 어르신 폴더의 파일을 전부 지운다(버킷 1개). 없으면 아무것도 하지 않는다. */
export async function purgeBucketFolder(bucket: string, profileId: string): Promise<number> {
  const storage = getGiokonClient().storage.from(bucket)
  let removed = 0
  for (;;) {
    const { data, error } = await storage.list(profileId, { limit: LIST_PAGE })
    if (error) throw new Error(error.message)
    const names = (data ?? []).map((f) => `${profileId}/${f.name}`)
    if (names.length === 0) return removed
    const { data: deleted, error: rmError } = await storage.remove(names)
    if (rmError) throw new Error(rmError.message)
    // RLS 가 삭제를 막으면 오류 없이 빈 배열이 돌아올 수 있다. 같은 첫 페이지를
    // 무한히 반복하거나 요청한 개수를 실제 파기 개수로 보고하지 않는다.
    if (!deleted?.length) throw new Error('삭제할 수 없는 사진이 있어 파기를 중단했어요. 운영자에게 문의해 주세요.')
    removed += deleted.length
    if (names.length < LIST_PAGE && deleted.length === names.length) return removed
  }
}

/** 어르신의 Storage 파일 전량 파기(사진 + 프로그램 일지 사진). */
export async function purgeElderFiles(profileId: string): Promise<number> {
  const photos = await purgeBucketFolder(ELDER_PHOTO_BUCKET, profileId)
  const journals = await purgeBucketFolder(JOURNAL_PHOTO_BUCKET, profileId)
  return photos + journals
}
