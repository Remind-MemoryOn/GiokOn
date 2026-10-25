import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./withTabletOrientation.js');
const { configureManifest, transformMainActivity } = plugin;

const kotlin = `package kr.giokon.app
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }
}`;
const java = `package kr.giokon.app;
class MainActivity extends ReactActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(null);
  }
}`;

describe('태블릿 방향 네이티브 생성', () => {
  it.each([['kt', kotlin], ['java', java]])('%s에서 태블릿만 센서 가로 방향으로 시작하고 휴대폰은 세로 방향으로 시작한다', (language, contents) => {
    const result = transformMainActivity({ language, contents });
    expect(result.contents).toContain('smallestScreenWidthDp >= 600');
    expect(result.contents).toContain('android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE');
    expect(result.contents).toContain('android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT');
    expect(result.contents.indexOf('super.onCreate(null)')).toBeLessThan(result.contents.indexOf('SCREEN_ORIENTATION_SENSOR_LANDSCAPE'));
    expect(transformMainActivity(result)).toEqual(result);
  });

  it.each([
    { language: 'swift', contents: kotlin },
    { language: 'kt', contents: 'class MainActivity : ReactActivity() {}' },
    { language: 'java', contents: 'class MainActivity {}' },
    { language: 'kt', contents: kotlin.replace('override fun onCreate', 'fun unknown') },
  ])('알 수 없는 언어나 onCreate 구조는 설정을 조용히 생략하지 않는다: $language', activity => {
    expect(() => transformMainActivity(activity)).toThrow('withTabletOrientation');
  });

  it('MainActivity의 전역 세로 잠금을 없애고 Android 16 예외를 중복 없이 적용한다', () => {
    const otherProperty = { $: { 'android:name': 'other.property', 'android:value': 'keep' } };
    const otherActivity = { $: { 'android:name': '.OtherActivity', 'android:screenOrientation': 'portrait' } };
    const activity = {
      $: { 'android:name': '.MainActivity', 'android:screenOrientation': 'portrait', 'android:windowSoftInputMode': 'adjustResize' },
      property: [otherProperty, { $: { 'android:name': 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY', 'android:value': 'false' } }],
    };
    const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' }, activity: [activity, otherActivity] }] } };
    const result = configureManifest(manifest);
    expect(activity.$).toEqual({ 'android:name': '.MainActivity', 'android:windowSoftInputMode': 'adjustResize' });
    expect(activity.property).toEqual([otherProperty, { $: { 'android:name': 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY', 'android:value': 'true' } }]);
    expect(result.manifest.application[0].activity[1]).toEqual(otherActivity);
    expect(result.manifest.application[0]).not.toHaveProperty('property');
    expect(configureManifest(result)).toEqual(result);
  });

  it('MainActivity가 없으면 다른 Activity 방향을 변경하지 않고 생성에 실패한다', () => {
    expect(() => configureManifest({ manifest: { application: [{ $: {}, activity: [] }] } })).toThrow();
  });

  it('등록한 Expo mod가 MainActivity와 manifest에 실제 변경을 전달한다', async () => {
    const config = plugin({ name: 'Test', slug: 'test' });
    const modRequest = { platform: 'android', projectRoot: '/test', platformProjectRoot: '/test/android' };
    const activity = await config.mods.android.mainActivity({
      ...config, modRequest: { ...modRequest, modName: 'mainActivity' }, modResults: { language: 'kt', contents: kotlin },
    });
    expect(activity.modResults.contents).toContain('SCREEN_ORIENTATION_SENSOR_LANDSCAPE');
    const manifest = await config.mods.android.manifest({
      ...config, modRequest: { ...modRequest, modName: 'manifest' },
      modResults: { manifest: { application: [{ $: {}, activity: [{ $: { 'android:name': '.MainActivity', 'android:screenOrientation': 'portrait' } }] }] } },
    });
    expect(manifest.modResults.manifest.application[0].activity[0].$).not.toHaveProperty('android:screenOrientation');
    expect(manifest.modResults.manifest.application[0].activity[0].property).toEqual([
      { $: { 'android:name': 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY', 'android:value': 'true' } },
    ]);
  });
});
