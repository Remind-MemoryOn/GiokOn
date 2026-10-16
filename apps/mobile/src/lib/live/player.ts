// Playback and capture share one communication route and OS echo canceller.
import { duplexAudio } from './duplex';
export type PlaybackResult = 'completed' | 'interrupted' | 'empty';
export const playPcmTurn = (chunks: string[]): Promise<PlaybackResult> => duplexAudio.play(chunks);
export const stopPlayback = (): Promise<void> => duplexAudio.stopPlayback();
