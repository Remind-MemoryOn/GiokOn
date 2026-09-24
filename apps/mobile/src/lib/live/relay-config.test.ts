import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseVoiceRelayUrl } from './relay-config';

afterEach(() => vi.unstubAllGlobals());

describe('voice relay URL (the only voice path)', () => {
  it.each(['wss://voice.example.test/voice', 'wss://voice.example.test:8443/voice', 'wss://relay-1.giokon.kr/voice'])(
    'accepts a secure relay endpoint %s', value => {
      expect(parseVoiceRelayUrl(` ${value} `)).toBe(value);
    });
  it.each([undefined, '', '   ', 'not a url', 'ws://voice.example.test/voice', 'https://voice.example.test/voice',
    'wss://voice.example.test/', 'wss://voice.example.test/voice/', 'wss://voice.example.test/voice/extra',
    'wss://user:pw@voice.example.test/voice', 'wss://voice.example.test/voice?access_token=x', 'wss://voice.example.test/voice#frag',
    'wss:///voice', 'wss://-bad.example/voice'])(
    'rejects %j so the session cannot start on an unverified path', value => {
      expect(parseVoiceRelayUrl(value)).toBeNull();
    });
  it('does not depend on the runtime URL class (React Native parses pathname only for http/https)', () => {
    // RN Libraries/Blob/URL.js: wss 주소의 pathname 은 항상 '/' 이고 생성자가 끝에 '/' 를 붙인다.
    vi.stubGlobal('URL', class { pathname = '/'; protocol = 'wss:'; username = ''; password = ''; search = ''; hash = ''; });
    expect(parseVoiceRelayUrl('wss://voice.example.test/voice')).toBe('wss://voice.example.test/voice');
  });
});
