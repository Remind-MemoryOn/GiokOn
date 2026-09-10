// Edge Function: stt-transcribe — 음성 파일 → 텍스트 (CLOVA Speech Recognition, CSR)
//
// 클라이언트(요양일지 음성 업로드)가 오디오 파일을 보내면, 서버가 NCP CLOVA CSR 로
// 인식해 { text } 를 돌려준다. CLOVA 키(NCP_CLOVA_CLIENT_ID/SECRET)는 서버 시크릿이라
// 클라이언트에 노출되지 않는다.
//
// 배포:
//   supabase secrets set NCP_CLOVA_CLIENT_ID=... NCP_CLOVA_CLIENT_SECRET=...
//   supabase functions deploy stt-transcribe
//
// 참고: CSR 는 1분 이내 짧은 음성용. 장문은 "CLOVA Speech(장문)" 제품으로 교체 필요
// (인증 방식이 X-CLOVASPEECH-API-KEY + invoke URL 로 다름 — supabase/.env.example 주석).

// @ts-nocheck  (Deno 런타임 — 저장소 TS 빌드 대상 아님)
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CSR_ENDPOINT = 'https://naveropenapi.apigw.ntruss.com/recog/v1/stt'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-profile-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') {
    return json({ error: 'POST 만 허용됩니다.' }, 405)
  }

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: '로그인이 필요합니다.' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: user, error: authError } = await supabase.auth.getUser()
  if (authError || !user?.user) return json({ error: '유효하지 않은 세션입니다.' }, 401)
  const profileId = req.headers.get('x-profile-id')
  if (!profileId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId)) {
    return json({ error: '대상 어르신 정보가 필요합니다.' }, 400)
  }
  const checkPermission = async (): Promise<Response | null> => {
    try {
      const { data, error } = await supabase.rpc('can_process_profile', { p_profile_id: profileId })
        .abortSignal(AbortSignal.timeout(5000))
      if (error) return json({ error: '동의와 이용 권한을 확인할 수 없습니다.' }, 503)
      if (data !== true) return json({ error: '대상 어르신의 필수 동의와 담당 권한을 확인해 주세요.' }, 403)
      return null
    } catch { return json({ error: '동의와 이용 권한을 확인할 수 없습니다.' }, 503) }
  }
  const denied = await checkPermission()
  if (denied) return denied

  const clientId = Deno.env.get('NCP_CLOVA_CLIENT_ID')
  const clientSecret = Deno.env.get('NCP_CLOVA_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({ error: 'CLOVA 키(NCP_CLOVA_CLIENT_ID/SECRET)가 설정되지 않았습니다.' }, 500)
  }

  let audio: ArrayBuffer
  let lang = 'Kor'
  try {
    const form = await req.formData()
    const file = form.get('audio')
    const langField = form.get('lang')
    if (typeof langField === 'string' && langField) lang = langField
    if (!(file instanceof File)) {
      return json({ error: '오디오 파일(audio)이 필요합니다.' }, 400)
    }
    audio = await file.arrayBuffer()
  } catch { return json({ error: '오디오 파일을 포함한 multipart 요청이 필요합니다.' }, 400) }
  if (!audio || audio.byteLength === 0) {
    return json({ error: '빈 오디오입니다.' }, 400)
  }

  // Uploading can take time. Recheck immediately before external disclosure.
  const withdrawn = await checkPermission()
  if (withdrawn) return withdrawn
  let res: Response
  let body: string
  try {
    res = await fetch(`${CSR_ENDPOINT}?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    headers: {
      'X-NCP-APIGW-API-KEY-ID': clientId,
      'X-NCP-APIGW-API-KEY': clientSecret,
      'Content-Type': 'application/octet-stream',
    },
    body: audio,
    signal: AbortSignal.timeout(20000),
  })
    body = await res.text()
  } catch { return json({ error: '음성 인식 서버에 연결하지 못했습니다.' }, 502) }
  // A revoked caller must not receive a late transcript.
  const revoked = await checkPermission()
  if (revoked) return revoked
  if (!res.ok) {
    return json({ error: '음성 인식에 실패했습니다.' }, 502)
  }
  // CSR 응답: { "text": "..." }
  let text = ''
  try {
    text = (JSON.parse(body) as { text?: string }).text ?? ''
  } catch { return json({ error: '음성 인식 결과가 올바르지 않습니다.' }, 502) }
  if (typeof text !== 'string') return json({ error: '음성 인식 결과가 올바르지 않습니다.' }, 502)
  return json({ text })
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
