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
const {computeStats} = require('../harness/measure');
const {
  loadBenchmarkConfig,
  startHttpServer,
  requestBundle,
  buildBundle,
} = require('../harness/metro-helpers');

/**
 * First-build benchmark suite.
 *
 * Measures the full cold-start-to-first-bundle pipeline:
 * 1. Via runBuild() API (no HTTP server)
 * 2. Via HTTP (start server, request bundle, measure end-to-end)
 *
 * @param {Object} context
 * @param {string} context.fixtureDir
 * @param {string} context.entryPoint
 * @param {string} context.fixtureName
 * @param {Object} options
 * @param {number} options.iterations
 * @param {string[]} options.platforms
 * @returns {Promise<Array>} benchmark results
 */
module.exports = async function run(context, options = {}) {
  const {fixtureDir, entryPoint, fixtureName} = context;
  const {iterations = 3, platforms = ['ios']} = options;

  const results = [];
  const entryRelative = path.relative(fixtureDir, entryPoint);

  for (const platform of platforms) {
    // Benchmark runBuild (no HTTP, direct API)
    const buildSamples = [];
    for (let i = 0; i < iterations; i++) {
      const config = await loadBenchmarkConfig(fixtureDir);
      const {durationMs} = await buildBundle(config, entryRelative, {platform});
      buildSamples.push(durationMs);
    }

    const buildStats = computeStats(buildSamples);
    results.push({
      suite: 'first-build',
      fixture: fixtureName,
      metric: `runBuild/${platform}`,
      unit: 'ms',
      value: buildStats.median,
      stddev: buildStats.stddev,
      median: buildStats.median,
      min: buildStats.min,
      max: buildStats.max,
      p95: buildStats.p95,
      iterations,
    });

    // Benchmark HTTP end-to-end (start server -> request -> response)
    const httpSamples = [];
    for (let i = 0; i < iterations; i++) {
      const startTime = process.hrtime.bigint();

      const serverInfo = await startHttpServer(fixtureDir);
      const bundlePath = `${entryRelative.replace(/\.(js|ts|tsx)$/, '.bundle')}?platform=${platform}&dev=true&minify=false`;
      await requestBundle(serverInfo.baseUrl, bundlePath);

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;
      httpSamples.push(durationMs);

      await serverInfo.close();
    }

    const httpStats = computeStats(httpSamples);
    results.push({
      suite: 'first-build',
      fixture: fixtureName,
      metric: `http-e2e/${platform}`,
      unit: 'ms',
      value: httpStats.median,
      stddev: httpStats.stddev,
      median: httpStats.median,
      min: httpStats.min,
      max: httpStats.max,
      p95: httpStats.p95,
      iterations,
    });
  }

  return results;
};
