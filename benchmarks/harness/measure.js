/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

/**
 * Time an async operation with high-resolution timer.
 * Returns both the result and the duration in milliseconds.
 */
async function timeAsync(label, fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1e6;
  return {result, durationMs, label};
}

/**
 * Force garbage collection thoroughly.
 * Must run with --expose-gc. Calls gc() then pumps the event loop
 * 3 times via setImmediate to let deferred GC tasks complete.
 */
function forceGC() {
  return new Promise((resolve, reject) => {
    if (typeof global.gc !== 'function') {
      resolve();
      return;
    }
    global.gc();
    let rounds = 0;
    function tick() {
      rounds++;
      if (rounds < 3) {
        global.gc();
        setImmediate(tick);
      } else {
        resolve();
      }
    }
    setImmediate(tick);
  });
}

/**
 * Measure heap usage after forcing GC.
 * Returns heap metrics in megabytes.
 */
async function measureHeap() {
  await forceGC();
  const mem = process.memoryUsage();
  return {
    heapUsedMB: mem.heapUsed / 1024 / 1024,
    heapTotalMB: mem.heapTotal / 1024 / 1024,
    externalMB: mem.external / 1024 / 1024,
    rssMB: mem.rss / 1024 / 1024,
    arrayBuffersMB: mem.arrayBuffers / 1024 / 1024,
  };
}

/**
 * Compute statistics from an array of numbers.
 */
function computeStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const p95 = sorted[Math.min(Math.ceil(n * 0.95) - 1, n - 1)];
  const min = sorted[0];
  const max = sorted[n - 1];
  return {mean, median, stddev, min, max, p95, samples: sorted};
}

/**
 * Run a function N times and return statistics.
 */
async function benchmark(label, fn, options = {}) {
  const {iterations = 5, warmup = 0} = options;

  // Warmup runs (not measured)
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Measured runs
  const durations = [];
  for (let i = 0; i < iterations; i++) {
    const {durationMs} = await timeAsync(`${label}[${i}]`, fn);
    durations.push(durationMs);
  }

  const stats = computeStats(durations);
  return {label, ...stats};
}

/**
 * Compute linear regression slope from an array of values.
 * Used for leak detection (y = values, x = 0..n-1).
 * Returns slope (unit per iteration).
 */
function linearRegressionSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  return numerator / denominator;
}

module.exports = {
  timeAsync,
  forceGC,
  measureHeap,
  computeStats,
  benchmark,
  linearRegressionSlope,
};
