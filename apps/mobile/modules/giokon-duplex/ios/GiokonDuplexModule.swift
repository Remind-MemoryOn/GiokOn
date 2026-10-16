import ExpoModulesCore
import AVFoundation

public class GiokonDuplexModule: Module {
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var tapped = false
  private var playback: Promise?
  private var playbackGeneration = 0
  private var timeout: DispatchWorkItem?
  private var interruption: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("GiokonDuplex")
    Events("onAudio", "onError")
    AsyncFunction("startCapture") { (id: Int) in try self.startCapture(id) }.runOnQueue(.main)
    AsyncFunction("stopCapture") { self.stopCapture() }.runOnQueue(.main)
    AsyncFunction("play") { (encoded: String, promise: Promise) in try self.play(encoded, promise) }.runOnQueue(.main)
    AsyncFunction("stopPlayback") { self.stopPlayback() }.runOnQueue(.main)
    AsyncFunction("close") { self.closeAudio() }.runOnQueue(.main)
    OnCreate {
      self.interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification,
        object: nil, queue: .main) { [weak self] _ in
        self?.closeAudio()
        self?.sendEvent("onError", ["message": "AUDIO_INTERRUPTED"])
      }
    }
    OnAppEntersBackground {
      self.closeAudio()
      self.sendEvent("onError", ["message": "AUDIO_BACKGROUND"])
    }
    OnDestroy {
      if let observer = self.interruption { NotificationCenter.default.removeObserver(observer) }
      DispatchQueue.main.async { self.closeAudio() }
    }
  }

  private func failure(_ message: String) -> NSError {
    NSError(domain: "GiokonDuplex", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func prepare() throws {
    if engine != nil { return }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker])
    try session.setPreferredIOBufferDuration(0.02)
    try session.setActive(true)
    let audio = AVAudioEngine()
    do {
      try audio.inputNode.setVoiceProcessingEnabled(true)
      guard audio.inputNode.isVoiceProcessingEnabled else { throw failure("AEC_UNAVAILABLE") }
      let node = AVAudioPlayerNode()
      audio.attach(node)
      audio.connect(node, to: audio.mainMixerNode, format: AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!)
      try audio.start()
      engine = audio; player = node
    } catch {
      audio.stop()
      try? session.setActive(false, options: .notifyOthersOnDeactivation)
      throw error
    }
  }

  private func startCapture(_ id: Int) throws {
    guard !tapped else { throw failure("CAPTURE_ALREADY_RUNNING") }
    try prepare()
    let input = engine!.inputNode
    let format = input.outputFormat(forBus: 0)
    let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
    guard format.sampleRate > 0, let converter = AVAudioConverter(from: format, to: target) else { throw failure("CAPTURE_FORMAT_UNAVAILABLE") }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * 16000 / format.sampleRate)) + 32
      guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
      var consumed = false
      var conversionError: NSError?
      converter.convert(to: output, error: &conversionError) { _, status in
        if consumed { status.pointee = .noDataNow; return nil }
        consumed = true; status.pointee = .haveData; return buffer
      }
      if conversionError != nil {
        self?.sendEvent("onError", ["message": "CAPTURE_CONVERSION_FAILED"])
        return
      }
      guard output.frameLength > 0, let samples = output.int16ChannelData?[0] else { return }
      let data = Data(bytes: samples, count: Int(output.frameLength) * 2).base64EncodedString()
      self?.sendEvent("onAudio", ["captureId": id, "data": data])
    }
    tapped = true
  }

  private func stopCapture() {
    if tapped { engine?.inputNode.removeTap(onBus: 0); tapped = false }
  }

  private func play(_ encoded: String, _ promise: Promise) throws {
    stopPlayback()
    try prepare()
    guard let data = Data(base64Encoded: encoded), !data.isEmpty, data.count % 2 == 0, data.count <= 4320000 else { throw failure("INVALID_PLAYBACK_PCM") }
    let frames = data.count / 2
    let format = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
      let samples = buffer.floatChannelData?[0] else { throw failure("PLAYBACK_INIT_FAILED") }
    buffer.frameLength = AVAudioFrameCount(frames)
    data.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) in
      for i in 0..<frames {
        let raw = UInt16(bytes[i * 2]) | UInt16(bytes[i * 2 + 1]) << 8
        samples[i] = Float(Int16(bitPattern: raw)) / 32768
      }
    }
    playback = promise
    let generation = playbackGeneration
    player!.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      DispatchQueue.main.async {
        guard let self = self, generation == self.playbackGeneration else { return }
        self.timeout?.cancel(); self.timeout = nil
        let done = self.playback; self.playback = nil
        done?.resolve("completed")
      }
    }
    let timer = DispatchWorkItem { [weak self] in
      guard let self = self, generation == self.playbackGeneration, let pending = self.playback else { return }
      self.playback = nil
      self.stopPlayback()
      pending.reject(self.failure("PLAYBACK_TIMEOUT"))
    }
    timeout = timer
    DispatchQueue.main.asyncAfter(deadline: .now() + Double(frames) / 24000 + 5, execute: timer)
    player!.play()
  }

  private func stopPlayback() {
    playbackGeneration += 1
    timeout?.cancel(); timeout = nil
    player?.stop()
    let pending = playback; playback = nil
    pending?.resolve("interrupted")
  }

  private func closeAudio() {
    stopPlayback(); stopCapture()
    engine?.stop(); engine = nil; player = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
