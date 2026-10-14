/* global require, module */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withProjectBuildGradle } = require('expo/config-plugins');

const marker = '// giokon-windows-cmake-staging';
module.exports = config => withProjectBuildGradle(config, config => {
  if (!config.modResults.contents.includes(marker)) {
    config.modResults.contents += `
${marker}
// Keep Ninja output paths outside deeply nested pnpm dependency directories.
if (System.getProperty("os.name").toLowerCase().contains("windows")) {
    subprojects { subproject ->
        ["com.android.application", "com.android.library"].each { pluginId ->
            subproject.plugins.withId(pluginId) {
                subproject.extensions.getByName("androidComponents").finalizeDsl { androidDsl ->
                    androidDsl.externalNativeBuild.cmake.buildStagingDirectory =
                        rootProject.file(".cxx/" + subproject.name)
                }
            }
        }
    }
}
`;
  }
  return config;
});
