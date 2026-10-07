# Gemini key smoke test (Windows) - run from cmd:
#   powershell -NoProfile -ExecutionPolicy Bypass -File apps\voice-relay\scripts\gemini-smoke.ps1
#
# Calls the real Gemini API with the SAME request shapes the voice stack uses:
#   1) TTS   - apps/voice-relay/src/output.ts (generateContent, AUDIO_WAV 24kHz, voice Kore)
#   2) token - supabase/functions/live-token/handler.ts (v1beta auth_tokens + liveConnectConstraints)
#   3) Live  - apps/voice-relay/src/relay.ts (BidiGenerateContentConstrained + same setup) -> one text turn
# The key is read hidden and never written to disk or printed. Cost: one short TTS + one short Live turn.
# Messages are English on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
param(
  [string]$LiveModel = 'gemini-3.8-live',
  [string]$TtsModel = 'gemini-3.8-flash-tts',
  [string]$Voice = 'Kore'
)
$ErrorActionPreference = 'Stop'
$base = 'https://generativelanguage.googleapis.com/v1beta'

function Ok($msg) { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; exit 1 }
function ErrText($e) { if ($e.ErrorDetails -and $e.ErrorDetails.Message) { $e.ErrorDetails.Message } else { $e.Exception.Message } }
function PostJson($uri, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 12 -Compress))
  Invoke-RestMethod -Method Post -Uri $uri -Headers @{ 'x-goog-api-key' = $script:key } -ContentType 'application/json; charset=utf-8' -Body $bytes
}

$secure = Read-Host 'Gemini API key (hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$script:key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $script:key) { Fail 'empty key' }

try {
  # 1) TTS - same body as output.ts (ASCII text here; the relay sends Korean)
  try {
    $tts = PostJson "$base/models/${TtsModel}:generateContent" @{
      contents = @(@{ role = 'user'; parts = @(@{ text = 'Hello. This is a voice test.'; speech_metadata = @{ style = 'warm, calm and clear' } }) })
      generationConfig = @{
        responseModalities = @('AUDIO')
        responseFormat = @{ audio = @{ mimeType = 'AUDIO_WAV'; sampleRate = 24000 } }
        speechConfig = @{ voiceConfig = @{ voice = $Voice }; languageCode = 'ko-KR' }
      }
    }
  } catch { Fail "TTS ($TtsModel): $(ErrText $_)" }
  $audio = $tts.candidates[0].content.parts | Where-Object { $_.inlineData } | Select-Object -First 1
  if (-not $audio) { Fail "TTS ($TtsModel): no inlineData audio in response" }
  $bytes = [Convert]::FromBase64String($audio.inlineData.data)
  $riff = [Text.Encoding]::ASCII.GetString($bytes, 0, [Math]::Min(4, $bytes.Length))
  Ok "TTS ($TtsModel): $($audio.inlineData.mimeType), $($bytes.Length) bytes, header '$riff' (relay expects RIFF/WAV)"

  # 2) Ephemeral token - same body as live-token
  $now = [DateTime]::UtcNow
  try {
    $tok = PostJson "$base/auth_tokens" @{
      uses = 1
      expireTime = $now.AddMinutes(30).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
      newSessionExpireTime = $now.AddSeconds(90).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
      liveConnectConstraints = @{ model = "models/$LiveModel"; config = @{ sessionResumption = @{}; responseModalities = @('AUDIO') } }
    }
  } catch { Fail "auth_tokens (v1beta): $(ErrText $_)" }
  if (-not $tok.name) { Fail 'auth_tokens: no token name in response' }
  Ok 'auth_tokens (v1beta): ephemeral token issued (value not shown)'

  # 3) Live - same endpoint and setup as relay.ts, then one text turn
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ct = [Threading.CancellationToken]::None
  $uri = [Uri]('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + [Uri]::EscapeDataString($tok.name))
  try { $ws.ConnectAsync($uri, $ct).GetAwaiter().GetResult() } catch { Fail "Live connect: $($_.Exception.Message)" }
  function Send($obj) {
    $b = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 12 -Compress))
    $ws.SendAsync([ArraySegment[byte]]::new($b), [Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).GetAwaiter().GetResult()
  }
  function Recv([int]$ms = 20000) {
    $buf = New-Object byte[] 1048576; $stream = New-Object IO.MemoryStream
    $cts = New-Object Threading.CancellationTokenSource $ms
    do {
      $res = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $cts.Token).GetAwaiter().GetResult()
      if ($res.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { return "CLOSED: $($ws.CloseStatus) $($ws.CloseStatusDescription)" }
      $stream.Write($buf, 0, $res.Count)
    } while (-not $res.EndOfMessage)
    [Text.Encoding]::UTF8.GetString($stream.ToArray())
  }
  Send @{ setup = @{
    model = "models/$LiveModel"
    systemInstruction = @{ parts = @(@{ text = 'You are a friendly assistant. Answer in one short sentence.' }) }
    generationConfig = @{ responseModalities = @('AUDIO') }
    inputAudioTranscription = @{}; outputAudioTranscription = @{}
    realtimeInputConfig = @{ automaticActivityDetection = @{ disabled = $true }; activityHandling = 'NO_INTERRUPTION' }
    sessionResumption = @{}
  } }
  try { $first = Recv } catch { Fail "Live setup: no reply ($($_.Exception.Message))" }
  if ($first -notmatch 'setupComplete') { Fail "Live setup: $first" }
  Ok "Live ($LiveModel): setupComplete"

  Send @{ clientContent = @{ turns = @(@{ role = 'user'; parts = @(@{ text = 'Say hello in one short sentence.' }) }); turnComplete = $true } }
  $said = ''; $chunks = 0; $done = $false
  while (-not $done) {
    try { $m = Recv } catch { Fail "Live turn: timed out (heard '$said', $chunks audio chunks)" }
    if ($m -like 'CLOSED:*') { Fail "Live turn: $m" }
    $o = $m | ConvertFrom-Json
    if ($o.serverContent) {
      if ($o.serverContent.outputTranscription.text) { $said += $o.serverContent.outputTranscription.text }
      if ($o.serverContent.modelTurn.parts | Where-Object { $_.inlineData }) { $chunks++ }
      if ($o.serverContent.turnComplete) { $done = $true }
    }
  }
  if ($chunks -eq 0) { Fail 'Live turn: completed without audio' }
  Ok "Live ($LiveModel): reply received - $chunks audio chunks, transcript: '$said'"
  $ws.CloseAsync([Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', $ct).GetAwaiter().GetResult()
  Write-Host 'All checks passed.' -ForegroundColor Green
} finally {
  $script:key = $null
}
