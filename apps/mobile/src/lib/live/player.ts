// Playback and capture share one communication route and OS echo canceller.
import type { PcmAudioStream } from './pcm-stream';
import { duplexAudio } from './duplex';
export type PlaybackResult = 'completed' | 'interrupted' | 'empty';
export const playPcmTurn = (chunks: string[], stream?: PcmAudioStream): Promise<PlaybackResult> => stream ? duplexAudio.playStream(stream) : duplexAudio.play(chunks);
export const stopPlayback = (): Promise<void> => duplexAudio.stopPlayback();
