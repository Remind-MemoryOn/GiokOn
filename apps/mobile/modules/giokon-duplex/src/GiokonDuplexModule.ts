import { requireNativeModule } from 'expo';
export interface DuplexModule {
  startCapture(captureId: number): Promise<void>;
  stopCapture(): Promise<void>;
  play(data: string): Promise<'completed' | 'interrupted'>;
  startStream(): Promise<'completed' | 'interrupted'>;
  appendStream(data: string): Promise<void>;
  finishStream(): Promise<void>;
  stopPlayback(): Promise<void>;
  close(): Promise<void>;
  addListener(event: 'onAudio', callback: (event: {captureId: number; data: string}) => void): {remove(): void};
  addListener(event: 'onError', callback: (event: {message: string}) => void): {remove(): void};
}
export function getDuplexModule(): DuplexModule {
  return requireNativeModule<DuplexModule>('GiokonDuplex');
}
