/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const path = require('path');

/**
 * Create a Metro config suitable for benchmarking.
 *
 * Modeled on packages/metro/src/integration_tests/metro.config.js
 * but with maxWorkers: 4 for realistic multi-worker performance.
 *
 * @param {string} fixtureDir - Absolute path to the fixture project root
 * @param {Object} [overrides] - Config overrides
 * @returns {Object} Metro config
 */
function createBenchmarkConfig(fixtureDir, overrides = {}) {
  const repoRoot = path.resolve(__dirname, '..');
  return {
    cacheStores: [],
    maxWorkers: 4,
    projectRoot: fixtureDir,
    reporter: {update() {}},
    watchFolders: [repoRoot],
    server: {port: 0},
    resolver: {
      useWatchman: false,
      ...overrides.resolver,
    },
    transformer: {
      assetRegistryPath: path.join(fixtureDir, 'AssetRegistry'),
      enableBabelRCLookup: false,
      enableBabelRuntime: false,
      ...overrides.transformer,
    },
    ...overrides,
    // Ensure these nested objects are merged, not replaced
    resolver: {
      useWatchman: false,
      ...overrides.resolver,
    },
    transformer: {
      assetRegistryPath: path.join(fixtureDir, 'AssetRegistry'),
      enableBabelRCLookup: false,
      enableBabelRuntime: false,
      ...overrides.transformer,
    },
  };
}

module.exports = {createBenchmarkConfig};
