const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @mylife/shared is linked from ../packages/shared (outside the project root).
const sharedPackage = path.resolve(__dirname, '../packages/shared');
config.watchFolders = [...(config.watchFolders ?? []), sharedPackage];

// Resolve from the app's node_modules only, so zod is a single copy shared with @mylife/shared.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
