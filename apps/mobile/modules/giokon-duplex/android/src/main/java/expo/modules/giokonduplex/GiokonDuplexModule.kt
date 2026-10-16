package expo.modules.giokonduplex

import android.content.Context
import android.media.*
import android.media.audiofx.AcousticEchoCanceler
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

/** One communication route owns both sides, so AEC sees exactly the audio we play. */
class GiokonDuplexModule : Module() {
  private val lock = Any()
  private var recorder: AudioRecord? = null
  private var echo: AcousticEchoCanceler? = null
  private var captureThread: Thread? = null
  private val capturing = AtomicBoolean(false)
  private var playbackThread: Thread? = null
  private val playing = AtomicBoolean(false)
  private var audioManager: AudioManager? = null
  private var oldMode = AudioManager.MODE_NORMAL
  private var oldSpeaker = false
  private var focus: AudioFocusRequest? = null
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change < 0) {
      synchronized(lock) { closeAudio() }
      sendEvent("onError", mapOf("message" to "AUDIO_FOCUS_LOST"))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("GiokonDuplex")
    Events("onAudio", "onError")
    AsyncFunction("startCapture") { captureId: Int -> synchronized(lock) { startCapture(captureId) } }
    AsyncFunction("stopCapture") { synchronized(lock) { stopCapture() } }
    AsyncFunction("play") { data: String, promise: Promise -> synchronized(lock) { play(data, promise) } }
    AsyncFunction("stopPlayback") { synchronized(lock) { stopPlayback() } }
    AsyncFunction("close") { synchronized(lock) { closeAudio() } }
    OnActivityEntersBackground {
      synchronized(lock) { closeAudio() }
      sendEvent("onError", mapOf("message" to "AUDIO_BACKGROUND"))
    }
    OnDestroy { synchronized(lock) { closeAudio() } }
  }

  private fun route() {
    if (audioManager != null) return
    val manager = appContext.reactContext!!.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    oldMode = manager.mode; oldSpeaker = manager.isSpeakerphoneOn
    audioManager = manager
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    manager.isSpeakerphoneOn = true
    val granted = if (android.os.Build.VERSION.SDK_INT >= 26) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setOnAudioFocusChangeListener(focusListener, android.os.Handler(android.os.Looper.getMainLooper())).build()
      focus = request
      manager.requestAudioFocus(request)
    } else manager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { closeAudio(); error("AUDIO_FOCUS_DENIED") }
  }

  private fun startCapture(id: Int) {
    check(recorder == null) { "CAPTURE_ALREADY_RUNNING" }
    check(AcousticEchoCanceler.isAvailable()) { "AEC_UNAVAILABLE" }
    route()
    try {
      val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      check(minimum > 0) { "CAPTURE_FORMAT_UNAVAILABLE" }
      val input = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, 16000,
        AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum, 6400))
      recorder = input
      check(input.state == AudioRecord.STATE_INITIALIZED) { "CAPTURE_INIT_FAILED" }
      val aec = AcousticEchoCanceler.create(input.audioSessionId)
      echo = aec
      check(aec != null && aec.setEnabled(true) == AudioEffectSuccess && aec.enabled) { "AEC_INIT_FAILED" }
      input.startRecording()
      check(input.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "CAPTURE_START_FAILED" }
      capturing.set(true)
      captureThread = Thread({
        val buffer = ByteArray(640) // 20 ms, PCM16 mono 16 kHz.
        try {
          while (capturing.get()) {
            val count = input.read(buffer, 0, buffer.size)
            if (!capturing.get()) break
            check(count > 0 && count % 2 == 0) { "CAPTURE_READ_FAILED" }
            sendEvent("onAudio", mapOf("captureId" to id, "data" to Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP)))
          }
        } catch (_: Exception) {
          if (capturing.getAndSet(false)) sendEvent("onError", mapOf("message" to "CAPTURE_FAILED"))
        }
      }, "GiokonCapture").also { it.start() }
    } catch (error: Exception) { stopCapture(); throw error }
  }

  private fun stopCapture() {
    capturing.set(false)
    val input = recorder
    if (input?.recordingState == AudioRecord.RECORDSTATE_RECORDING) input.stop()
    captureThread?.join(1000)
    check(captureThread?.isAlive != true) { "CAPTURE_STOP_FAILED" }
    captureThread = null; echo?.release(); echo = null
    input?.release(); recorder = null
  }

  private fun play(encoded: String, promise: Promise) {
    stopPlayback()
    route()
    val bytes = Base64.decode(encoded, Base64.DEFAULT)
    check(bytes.isNotEmpty() && bytes.size % 2 == 0 && bytes.size <= 4320000) { "INVALID_PLAYBACK_PCM" }
    val output = AudioTrack.Builder()
      .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      .setAudioFormat(AudioFormat.Builder().setSampleRate(24000).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
      .setBufferSizeInBytes(maxOf(9600, AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)))
      .setTransferMode(AudioTrack.MODE_STREAM).build()
    if (output.state != AudioTrack.STATE_INITIALIZED) { output.release(); error("PLAYBACK_INIT_FAILED") }
    playing.set(true)
    playbackThread = Thread({
      var completed = false
      var failure: Exception? = null
      try {
        output.play()
        var offset = 0
        val deadline = android.os.SystemClock.elapsedRealtime() + bytes.size / 48 + 5000
        while (playing.get()) {
          check(android.os.SystemClock.elapsedRealtime() < deadline) { "PLAYBACK_TIMEOUT" }
          if (offset < bytes.size) {
            val count = output.write(bytes, offset, minOf(1920, bytes.size - offset), AudioTrack.WRITE_NON_BLOCKING)
            check(count >= 0) { "PLAYBACK_WRITE_FAILED" }
            offset += count
          }
          if (offset == bytes.size && output.playbackHeadPosition.toLong() >= bytes.size / 2) {
            completed = true; break
          }
          Thread.sleep(5)
        }
      } catch (error: Exception) { failure = error }
      finally {
        try { output.pause(); output.flush() } catch (_: Exception) { }
        output.release()
        if (failure != null) promise.reject("AUDIO_PLAYBACK", "PLAYBACK_FAILED", failure)
        else promise.resolve(if (completed && playing.get()) "completed" else "interrupted")
      }
    }, "GiokonPlayback").also { it.start() }
  }

  private fun stopPlayback() {
    playing.set(false)
    playbackThread?.join(1000)
    check(playbackThread?.isAlive != true) { "PLAYBACK_STOP_FAILED" }
    playbackThread = null
  }

  private fun closeAudio() {
    try { stopPlayback() } finally {
      try { stopCapture() } finally {
        audioManager?.let {
          if (android.os.Build.VERSION.SDK_INT >= 26) focus?.let { request -> it.abandonAudioFocusRequest(request) }
          else it.abandonAudioFocus(focusListener)
          it.isSpeakerphoneOn = oldSpeaker; it.mode = oldMode
        }
        focus = null
        audioManager = null
      }
    }
  }
  companion object { private const val AudioEffectSuccess = 0 }
}
