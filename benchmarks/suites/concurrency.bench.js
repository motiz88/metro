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
const {computeStats, timeAsync} = require('../harness/measure');
const {startHttpServer, requestBundle} = require('../harness/metro-helpers');

/**
 * Concurrency benchmark suite.
 *
 * Measures how Metro handles multiple simultaneous bundle requests.
 *
 * Scenarios:
 * 1. Same entry, different platforms (ios + android)
 * 2. Multiple different entries simultaneously
 * 3. Repeated identical requests (revision cache test)
 * 4. (Optional) Load test with autocannon
 *
 * @param {Object} context
 * @param {string} context.fixtureDir
 * @param {string} context.entryPoint
 * @param {string} context.fixtureName
 * @param {Object} options
 * @param {number} options.iterations
 * @param {boolean} options.useAutocannon
 * @returns {Promise<Array>} benchmark results
 */
module.exports = async function run(context, options = {}) {
  const {fixtureDir, entryPoint, fixtureName} = context;
  const {iterations = 3, useAutocannon = false} = options;

  const results = [];
  const entryRelative = path.relative(fixtureDir, entryPoint);
  const bundleBase = entryRelative.replace(/\.(js|ts|tsx)$/, '.bundle');

  // Start server
  const serverInfo = await startHttpServer(fixtureDir);
  const {baseUrl} = serverInfo;

  // Warm up with one request
  await requestBundle(baseUrl, `${bundleBase}?platform=ios&dev=true&minify=false`);

  // Scenario 1: Two platforms simultaneously
  const twoPlatsResults = [];
  for (let i = 0; i < iterations; i++) {
    const {durationMs} = await timeAsync('2_platforms', () =>
      Promise.all([
        requestBundle(baseUrl, `${bundleBase}?platform=ios&dev=true&minify=false`),
        requestBundle(baseUrl, `${bundleBase}?platform=android&dev=true&minify=false`),
      ]),
    );
    twoPlatsResults.push(durationMs);
  }
  const twoPlatsStats = computeStats(twoPlatsResults);
  results.push({
    suite: 'concurrency',
    fixture: fixtureName,
    metric: '2_platforms_wall',
    unit: 'ms',
    value: twoPlatsStats.median,
    stddev: twoPlatsStats.stddev,
    median: twoPlatsStats.median,
    min: twoPlatsStats.min,
    max: twoPlatsStats.max,
    p95: twoPlatsStats.p95,
    iterations,
  });

  // Scenario 2: 10 identical requests simultaneously (revision cache)
  const identicalResults = [];
  for (let i = 0; i < iterations; i++) {
    const requests = Array.from({length: 10}, () =>
      requestBundle(baseUrl, `${bundleBase}?platform=ios&dev=true&minify=false`),
    );
    const {durationMs} = await timeAsync('10_identical', () =>
      Promise.all(requests),
    );
    identicalResults.push(durationMs);
  }
  const identicalStats = computeStats(identicalResults);
  results.push({
    suite: 'concurrency',
    fixture: fixtureName,
    metric: '10_identical_wall',
    unit: 'ms',
    value: identicalStats.median,
    stddev: identicalStats.stddev,
    median: identicalStats.median,
    min: identicalStats.min,
    max: identicalStats.max,
    p95: identicalStats.p95,
    iterations,
  });

  // Scenario 3: Per-request latency under load (10 identical)
  const perRequestSamples = [];
  for (let i = 0; i < iterations; i++) {
    const requests = Array.from({length: 10}, () =>
      requestBundle(baseUrl, `${bundleBase}?platform=ios&dev=true&minify=false`),
    );
    const responses = await Promise.all(requests);
    for (const r of responses) {
      perRequestSamples.push(r.durationMs);
    }
  }
  const perRequestStats = computeStats(perRequestSamples);
  results.push({
    suite: 'concurrency',
    fixture: fixtureName,
    metric: 'per_request_under_load',
    unit: 'ms',
    value: perRequestStats.median,
    stddev: perRequestStats.stddev,
    median: perRequestStats.median,
    min: perRequestStats.min,
    max: perRequestStats.max,
    p95: perRequestStats.p95,
    iterations: perRequestSamples.length,
  });

  // Scenario 4: Autocannon load test (optional)
  if (useAutocannon) {
    try {
      const autocannonResults = await runAutocannon(
        baseUrl,
        `/${bundleBase}?platform=ios&dev=true&minify=false`,
      );
      results.push({
        suite: 'concurrency',
        fixture: fixtureName,
        metric: 'autocannon_rps',
        unit: 'req/s',
        value: autocannonResults.requests.average,
        stddev: 0,
        median: autocannonResults.requests.average,
        min: autocannonResults.requests.min,
        max: autocannonResults.requests.max,
        p95: autocannonResults.requests.average,
        iterations: 1,
      });
      results.push({
        suite: 'concurrency',
        fixture: fixtureName,
        metric: 'autocannon_p99_latency',
        unit: 'ms',
        value: autocannonResults.latency.p99,
        stddev: 0,
        median: autocannonResults.latency.p50,
        min: autocannonResults.latency.min,
        max: autocannonResults.latency.max,
        p95: autocannonResults.latency.p99,
        iterations: 1,
      });
    } catch (err) {
      console.warn(`Autocannon test skipped: ${err.message}`);
    }
  }

  await serverInfo.close();
  return results;
};

/**
 * Run autocannon load test.
 */
function runAutocannon(baseUrl, urlPath) {
  return new Promise((resolve, reject) => {
    try {
      const autocannon = require('autocannon');
      const instance = autocannon({
        url: `${baseUrl}${urlPath}`,
        connections: 50,
        duration: 10,
        pipelining: 1,
      });
      autocannon.track(instance, {renderProgressBar: false});
      instance.on('done', resolve);
      instance.on('error', reject);
    } catch (err) {
      reject(new Error(`autocannon not available: ${err.message}`));
    }
  });
}
