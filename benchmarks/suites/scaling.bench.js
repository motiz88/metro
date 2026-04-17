/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {computeStats} = require('../harness/measure');
const {loadBenchmarkConfig, buildGraph} = require('../harness/metro-helpers');
const {generateFixture} = require('../fixtures/generator');

/**
 * Scaling benchmark suite.
 *
 * Synthetic fixtures only. Generates projects at multiple scales and
 * measures buildGraph() to reveal scaling behavior:
 * - Absolute time at each scale
 * - Per-module cost (microseconds/module)
 *
 * @param {Object} context - ignored (generates its own fixtures)
 * @param {Object} options
 * @param {number[]} options.scales - module counts to test
 * @param {number} options.iterations
 * @param {string} options.tempDir - temp directory for fixtures
 * @returns {Promise<Array>} benchmark results
 */
module.exports = async function run(context, options = {}) {
  const {
    scales = [100, 500, 1000, 2000, 5000, 10000],
    iterations = 3,
    tempDir = path.join(__dirname, '..', '.fixture-cache', 'scaling'),
  } = options;

  const results = [];

  for (const scale of scales) {
    const fixtureDir = path.join(tempDir, `scale_${scale}`);

    // Generate fixture at this scale
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, {recursive: true});
      await generateFixture({
        outputDir: fixtureDir,
        scale,
        seed: 42,
      });
    }

    const entryPoint = path.join(fixtureDir, 'index.js');
    const config = await loadBenchmarkConfig(fixtureDir);

    // Benchmark buildGraph
    const samples = [];
    const moduleCounts = [];
    for (let i = 0; i < iterations; i++) {
      const {durationMs, moduleCount} = await buildGraph(
        // Pass raw config object for buildGraph (it takes InputConfigT)
        {
          ...config,
          projectRoot: fixtureDir,
        },
        [entryPoint],
      );
      samples.push(durationMs);
      moduleCounts.push(moduleCount);
    }

    const stats = computeStats(samples);
    const avgModuleCount = moduleCounts.reduce((a, b) => a + b, 0) / moduleCounts.length;
    const perModuleUs = (stats.median / avgModuleCount) * 1000; // ms -> us

    results.push({
      suite: 'scaling',
      fixture: `synthetic/${scale}`,
      metric: 'buildGraph',
      unit: 'ms',
      value: stats.median,
      stddev: stats.stddev,
      median: stats.median,
      min: stats.min,
      max: stats.max,
      p95: stats.p95,
      iterations,
      extra: `modules=${Math.round(avgModuleCount)}`,
    });

    results.push({
      suite: 'scaling',
      fixture: `synthetic/${scale}`,
      metric: 'perModule',
      unit: 'us',
      value: perModuleUs,
      stddev: (stats.stddev / avgModuleCount) * 1000,
      median: perModuleUs,
      min: (stats.min / avgModuleCount) * 1000,
      max: (stats.max / avgModuleCount) * 1000,
      p95: (stats.p95 / avgModuleCount) * 1000,
      iterations,
      extra: `modules=${Math.round(avgModuleCount)}`,
    });
  }

  return results;
};
