# GiokonDuplex

앱 전용 Expo SDK 54 네이티브 모듈. 입력은 PCM16 mono 16 kHz, 검증된 TTS 출력은 PCM16 mono 24 kHz다. 음성은 메모리에서만 처리하고 파일·로그에 남기지 않는다.

- Android: `VOICE_COMMUNICATION` AudioRecord + 같은 communication 경로의 AudioTrack, 녹음 세션에 `AcousticEchoCanceler`를 연결한다. AEC 존재·활성화 확인 실패 시 대화를 시작하지 않는다. 포커스 상실·백그라운드에서 닫는다.
- iOS: `playAndRecord`/`voiceChat` AVAudioEngine VoiceProcessing과 AVAudioPlayerNode를 함께 사용한다. `.dataPlayedBack`만 완료로 인정한다. 오디오 인터럽트·백그라운드에서 닫는다.
- `startCapture(captureId)` 준비 뒤 `onAudio` 이벤트를 받는다. ID로 지난 녹음의 늦은 이벤트를 버린다. `stopPlayback`은 녹음을 종료하지 않는다. `close`는 둘 다 정리한다.
- JS 어댑터는 녹음 시작·종료를 직렬화하고 네이티브 명령 5초/재생 길이+6초 한도를 둔다. 초기화·정리 실패 후 무처리 오디오로 폴백하지 않는다.
- 발화 감지는 AEC 처리된 RMS 0.015 이상 200 ms 지속을 초기 기준으로 쓴다. 사람 음성의 의미를 판별하는 VAD 모델이 아니므로, 기기별 스피커 에코·주변 소음·작은 목소리 검증이 필요하다.
- 재생 중 입력은 마지막 240 ms만 유지하다가 발화 감지 후 최대 2초를 보존한다. 네이티브 중단 확인이 그 한도를 넘으면 음성을 잘라 정상 입력으로 가장하지 않고 멈춘다. 영수증 뒤에는 즉시 스트리밍하며, 저장 대기는 음성 버퍼에 쌓지 않는다.

네이티브 변경이므로 APK/IPA 재빌드가 필요하다. `.gitignore`와 `.easignore`에서 이 모듈의 `android`/`ios` 소스만 예외로 포함하며, 네이티브 `build` 산출물은 제외한다.

실기기 필수 검증: TTS만 들을 때 자기 음성으로 끊기지 않음 → 말하는 중 겹쳐 답하면 중단 → 첫 음절부터 전사 → DB `interrupted` 저장 → 다음 턴 → 백그라운드/회수 시 녹음 종료. OS AEC를 켰다는 사실만으로 품질 통과를 주장하지 않는다.
