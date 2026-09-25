// 동의 유형 → 동의서 전문 경로. 동의를 받는 화면(어르신 등록 · 어르신 동의 관리)이 같은 표를 쓴다.
// 예전엔 화면마다 표를 따로 둬 `terms_required` 가 한쪽은 약관, 한쪽은 회원 개인정보 동의서를 가리켰다.
import type { ConsentType } from '@giokon/core';

export const CONSENT_DOCUMENT_PATH: Record<ConsentType, string> = {
  terms_required: '/terms',
  privacy_required: '/consents/member-privacy',
  elder_privacy_required: '/consents/elder-privacy',
  sensitive_health_voice: '/consents/elder-sensitive',
  cross_border_transfer: '/consents/elder-cross-border',
  ai_processing: '/consents/elder-ai',
  marketing_optional: '/privacy',
};
