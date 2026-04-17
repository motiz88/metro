/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const {timeAsync, benchmark} = require('../harness/measure');
const {loadBenchmarkConfig, createReadyServer} = require('../harness/metro-helpers');

/**
 * Startup benchmark suite.
 *
 * Measures cold startup time: loadConfig() and server.ready().
 * Each iteration creates a fresh MetroServer (no caching).
 *
 * @param {Object} context
 * @param {string} context.fixtureDir
 * @param {string} context.entryPoint
 * @param {string} context.fixtureName - e.g. 'synthetic/1000' or 'real-world/bluesky'
 * @param {Object} options
 * @param {number} options.iterations
 * @returns {Promise<Array>} benchmark results
 */
module.exports = async function run(context, options = {}) {
  const {fixtureDir, fixtureName} = context;
  const {iterations = 5} = options;

  const results = [];

  // Benchmark loadConfig
  const configResult = await benchmark(
    'loadConfig',
    async () => {
      await loadBenchmarkConfig(fixtureDir);
    },
    {iterations},
  );
  results.push({
    suite: 'startup',
    fixture: fixtureName,
    metric: 'loadConfig',
    unit: 'ms',
    value: configResult.median,
    stddev: configResult.stddev,
    median: configResult.median,
    min: configResult.min,
    max: configResult.max,
    p95: configResult.p95,
    iterations,
  });

  // Benchmark server.ready (includes filesystem crawl, dependency graph init)
  const serverReadySamples = [];
  for (let i = 0; i < iterations; i++) {
    const {server, readyDurationMs} = await createReadyServer(fixtureDir);
    serverReadySamples.push(readyDurationMs);
    await server.end();
  }

  const {computeStats} = require('../harness/measure');
  const serverStats = computeStats(serverReadySamples);
  results.push({
    suite: 'startup',
    fixture: fixtureName,
    metric: 'serverReady',
    unit: 'ms',
    value: serverStats.median,
    stddev: serverStats.stddev,
    median: serverStats.median,
    min: serverStats.min,
    max: serverStats.max,
    p95: serverStats.p95,
    iterations,
  });

  return results;
};
