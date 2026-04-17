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
const {measureHeap, linearRegressionSlope} = require('../harness/measure');
const {
  loadBenchmarkConfig,
  startHttpServer,
  requestBundle,
} = require('../harness/metro-helpers');

/**
 * Memory benchmark suite.
 *
 * Tracks heap usage at key lifecycle points and detects leaks
 * by measuring heap growth across repeated rebuilds.
 *
 * Requires --expose-gc for accurate measurements.
 *
 * @param {Object} context
 * @param {string} context.fixtureDir
 * @param {string} context.entryPoint
 * @param {string} context.fixtureName
 * @param {Object} options
 * @param {number} options.rebuildIterations - number of rebuilds for leak detection
 * @returns {Promise<Array>} benchmark results
 */
module.exports = async function run(context, options = {}) {
  const {fixtureDir, entryPoint, fixtureName} = context;
  const {rebuildIterations = 10} = options;

  const results = [];
  const entryRelative = path.relative(fixtureDir, entryPoint);

  if (typeof global.gc !== 'function') {
    console.warn(
      'Warning: --expose-gc not set. Memory measurements will be less accurate.',
    );
  }

  // 1. Baseline measurement (before any Metro code)
  const baseline = await measureHeap();
  results.push(makeResult(fixtureName, 'baseline_mb', baseline.heapUsedMB));

  // 2. After loading config
  const config = await loadBenchmarkConfig(fixtureDir);
  const afterConfig = await measureHeap();
  results.push(makeResult(fixtureName, 'after_config_mb', afterConfig.heapUsedMB));

  // 3. Start server and measure after server.ready() (filesystem crawl)
  const serverInfo = await startHttpServer(fixtureDir);
  const afterCrawl = await measureHeap();
  results.push(makeResult(fixtureName, 'after_crawl_mb', afterCrawl.heapUsedMB));

  // 4. First bundle request
  const bundlePath = `${entryRelative.replace(/\.(js|ts|tsx)$/, '.bundle')}?platform=ios&dev=true&minify=false`;
  await requestBundle(serverInfo.baseUrl, bundlePath);
  const afterFirstBuild = await measureHeap();
  results.push(
    makeResult(fixtureName, 'after_first_build_mb', afterFirstBuild.heapUsedMB),
  );

  // 5. Repeated rebuilds with file changes -- leak detection
  const rebuildHeapSamples = [afterFirstBuild.heapUsedMB];

  // Find a leaf component to modify
  const componentsDir = path.join(fixtureDir, 'components');
  const componentFiles = fs.existsSync(componentsDir)
    ? fs.readdirSync(componentsDir).filter(f => f.endsWith('.js'))
    : [];

  for (let i = 0; i < rebuildIterations; i++) {
    // Modify a file to trigger rebuild
    if (componentFiles.length > 0) {
      const targetFile = componentFiles[i % componentFiles.length];
      const targetPath = path.join(componentsDir, targetFile);
      const content = fs.readFileSync(targetPath, 'utf8');
      // Add a comment to force a change without breaking the module
      const modified = content.replace(
        /\/\/ rebuild-marker.*/,
        '',
      ) + `\n// rebuild-marker iteration ${i} timestamp ${Date.now()}\n`;
      fs.writeFileSync(targetPath, modified);
    }

    // Request the bundle again (Metro will rebuild incrementally)
    await requestBundle(serverInfo.baseUrl, bundlePath);
    const heap = await measureHeap();
    rebuildHeapSamples.push(heap.heapUsedMB);
  }

  const afterRebuilds = rebuildHeapSamples[rebuildHeapSamples.length - 1];
  results.push(
    makeResult(fixtureName, `after_${rebuildIterations}_rebuilds_mb`, afterRebuilds),
  );

  // Compute leak slope (MB per rebuild iteration)
  const slope = linearRegressionSlope(rebuildHeapSamples);
  results.push(makeResult(fixtureName, 'growth_per_rebuild_mb', slope));

  // Flag potential leak
  if (slope > 1.0) {
    console.warn(
      `\u26a0 Potential memory leak detected in ${fixtureName}: ` +
        `heap growing at ${slope.toFixed(2)} MB/rebuild`,
    );
  }

  // 6. After cleanup
  await serverInfo.close();
  const afterCleanup = await measureHeap();
  results.push(
    makeResult(fixtureName, 'after_cleanup_mb', afterCleanup.heapUsedMB),
  );

  // RSS measurements
  results.push(makeResult(fixtureName, 'peak_rss_mb', afterFirstBuild.rssMB));

  return results;
};

function makeResult(fixtureName, metric, value) {
  return {
    suite: 'memory',
    fixture: fixtureName,
    metric,
    unit: 'MB',
    value,
    stddev: 0,
    median: value,
    min: value,
    max: value,
    p95: value,
    iterations: 1,
  };
}
