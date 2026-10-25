/* global require, module */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AndroidConfig, withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const marker = '// giokon-tablet-orientation';
const compatibilityProperty = 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY';

function configureManifest(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  // Android chooses the orientation per device in onCreate, instead of globally locking phones and tablets alike.
  delete activity.$['android:screenOrientation'];
  // API 36 ignores requestedOrientation on sw600dp displays unless this activity opts out.
  // This opt-out is temporary: targeting API 37 requires revisiting the tablet orientation policy.
  // https://developer.android.com/about/versions/16/behavior-changes-16#adaptive-layouts
  activity.property = [
    ...(activity.property ?? []).filter(property => property.$['android:name'] !== compatibilityProperty),
    { $: { 'android:name': compatibilityProperty, 'android:value': 'true' } },
  ];
  return manifest;
}

function transformMainActivity(activity) {
  const { language, contents } = activity;
  if (language !== 'kt' && language !== 'java') {
    throw new Error(`withTabletOrientation: unsupported MainActivity language: ${language}`);
  }
  if (contents.includes(marker)) return activity;
  const declaration = language === 'kt'
    ? /override\s+fun\s+onCreate\s*\([^)]*\)\s*\{/
    : /(?:public|protected)\s+void\s+onCreate\s*\([^)]*\)\s*\{/;
  const method = declaration.exec(contents);
  if (!method) throw new Error('withTabletOrientation: MainActivity onCreate was not found');
  const bodyStart = method.index + method[0].length;
  const bodyEnd = contents.indexOf('}', bodyStart);
  const body = contents.slice(bodyStart, bodyEnd);
  const calls = [...body.matchAll(/^[\t ]*super\.onCreate\([^\n)]*\);?\s*$/gm)];
  if (calls.length !== 1) {
    throw new Error('withTabletOrientation: expected one super.onCreate call in MainActivity onCreate');
  }
  const call = calls[0];
  const offset = bodyStart + call.index + call[0].trimEnd().length;
  // smallestScreenWidthDp is unchanged by rotation or the software keyboard, unlike current window height/width.
  const orientation = language === 'kt'
    ? `
    ${marker}
    requestedOrientation = if (resources.configuration.smallestScreenWidthDp >= 600) {
      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    } else {
      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }`
    : `
    ${marker}
    setRequestedOrientation(getResources().getConfiguration().smallestScreenWidthDp >= 600
        ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        : android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);`;
  return { ...activity, contents: contents.slice(0, offset) + orientation + contents.slice(offset) };
}

module.exports = config => {
  config = withAndroidManifest(config, config => {
    config.modResults = configureManifest(config.modResults);
    return config;
  });
  return withMainActivity(config, config => {
    config.modResults = transformMainActivity(config.modResults);
    return config;
  });
};
module.exports.configureManifest = configureManifest;
module.exports.transformMainActivity = transformMainActivity;
