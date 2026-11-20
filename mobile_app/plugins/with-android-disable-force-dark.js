const { withAndroidStyles } = require('expo/config-plugins');

/**
 * Opts the app out of Android "force dark" (Xiaomi HyperOS/MIUI, Android 10+), which
 * darkens third-party colors on top of our own dark theme and makes surfaces blend together.
 */
module.exports = function withAndroidDisableForceDark(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults.resources.style ?? [];
    const appTheme = styles.find((style) => style.$.name === 'AppTheme');
    if (appTheme) {
      appTheme.item = (appTheme.item ?? []).filter(
        (item) => item.$.name !== 'android:forceDarkAllowed',
      );
      appTheme.item.push({ $: { name: 'android:forceDarkAllowed' }, _: 'false' });
    }
    return config;
  });
};
