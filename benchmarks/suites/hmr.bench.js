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
const {startHttpServer, requestBundle} = require('../harness/metro-helpers');

/**
 * HMR benchmark suite.
 *
 * Measures incremental rebuild latency: time from a file change to
 * receiving the HMR update message on a WebSocket connection.
 *
 * @param {Object} context
 * @param {string} context.fixtureDir
 * @param {string} context.entryPoint
 * @param {string} context.fixtureName
 * @param {Object} options
 * @param {number} options.iterations - number of HMR cycles
 * @param {boolean} options.testSharedModuleEdit - also test editing shared modules
 * @returns {Promise<Array>} benchmark results
 */
module.exports = async function run(context, options = {}) {
  const {fixtureDir, entryPoint, fixtureName} = context;
  const {iterations = 20, testSharedModuleEdit = true} = options;

  const results = [];
  const entryRelative = path.relative(fixtureDir, entryPoint);

  // Start server
  const serverInfo = await startHttpServer(fixtureDir);

  // Request initial bundle to populate the graph
  const bundlePath = `${entryRelative.replace(/\.(js|ts|tsx)$/, '.bundle')}?platform=ios&dev=true&minify=false`;
  await requestBundle(serverInfo.baseUrl, bundlePath);

  // Connect WebSocket to /hot
  const WebSocket = require('ws');
  const wsUrl = `ws://localhost:${serverInfo.port}/hot`;

  // Measure leaf component edits
  const leafSamples = await measureHMRLatency({
    wsUrl,
    fixtureDir,
    bundlePath: `${entryRelative.replace(/\.(js|ts|tsx)$/, '.bundle')}?platform=ios&dev=true&minify=false`,
    editTarget: 'leaf',
    iterations,
  });

  if (leafSamples.length > 0) {
    const leafStats = computeStats(leafSamples);
    results.push({
      suite: 'hmr',
      fixture: fixtureName,
      metric: 'latency/leaf',
      unit: 'ms',
      value: leafStats.median,
      stddev: leafStats.stddev,
      median: leafStats.median,
      min: leafStats.min,
      max: leafStats.max,
      p95: leafStats.p95,
      iterations: leafSamples.length,
    });
  }

  // Measure shared module edits (higher invalidation scope)
  if (testSharedModuleEdit) {
    const sharedSamples = await measureHMRLatency({
      wsUrl,
      fixtureDir,
      bundlePath,
      editTarget: 'shared',
      iterations: Math.min(iterations, 10),
    });

    if (sharedSamples.length > 0) {
      const sharedStats = computeStats(sharedSamples);
      results.push({
        suite: 'hmr',
        fixture: fixtureName,
        metric: 'latency/shared',
        unit: 'ms',
        value: sharedStats.median,
        stddev: sharedStats.stddev,
        median: sharedStats.median,
        min: sharedStats.min,
        max: sharedStats.max,
        p95: sharedStats.p95,
        iterations: sharedSamples.length,
      });
    }
  }

  await serverInfo.close();
  return results;
};

/**
 * Measure HMR latency by connecting a WebSocket, editing files,
 * and timing how long until an update message arrives.
 */
async function measureHMRLatency(options) {
  const {wsUrl, fixtureDir, bundlePath, editTarget, iterations} = options;
  const WebSocket = require('ws');
  const samples = [];

  // Find files to edit
  let filesToEdit;
  if (editTarget === 'leaf') {
    const componentsDir = path.join(fixtureDir, 'components');
    filesToEdit = fs.existsSync(componentsDir)
      ? fs
          .readdirSync(componentsDir)
          .filter(f => f.endsWith('.js') && f.startsWith('Component_'))
          .map(f => path.join(componentsDir, f))
      : [];
  } else {
    // Shared modules
    filesToEdit = [
      path.join(fixtureDir, 'utils', 'helpers.js'),
      path.join(fixtureDir, 'utils', 'constants.js'),
    ].filter(f => fs.existsSync(f));
  }

  if (filesToEdit.length === 0) {
    console.warn(`No ${editTarget} files found for HMR testing`);
    return samples;
  }

  for (let i = 0; i < iterations; i++) {
    const ws = new WebSocket(wsUrl);

    try {
      // Wait for connection
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000);
      });

      // Register entrypoints (HMR protocol)
      ws.send(
        JSON.stringify({
          type: 'register-entrypoints',
          entryPoints: [bundlePath],
        }),
      );

      // Wait a moment for registration to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Edit the file
      const targetFile = filesToEdit[i % filesToEdit.length];
      const originalContent = fs.readFileSync(targetFile, 'utf8');
      const modifiedContent =
        originalContent.replace(/\/\/ hmr-marker.*/g, '') +
        `\n// hmr-marker iteration ${i} ts ${Date.now()}\n`;

      const editStart = process.hrtime.bigint();
      fs.writeFileSync(targetFile, modifiedContent);

      // Wait for HMR update message
      const latencyMs = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('HMR update timeout (30s)'));
        }, 30000);

        ws.on('message', data => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'update-start' || msg.type === 'update' || msg.type === 'update-done') {
            clearTimeout(timeout);
            const editEnd = process.hrtime.bigint();
            resolve(Number(editEnd - editStart) / 1e6);
          }
          if (msg.type === 'error') {
            clearTimeout(timeout);
            reject(new Error(`HMR error: ${msg.body?.message || 'unknown'}`));
          }
        });
      });

      samples.push(latencyMs);

      // Restore file for next iteration
      fs.writeFileSync(targetFile, originalContent);

      // Small delay between iterations for file watcher to settle
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.warn(`HMR iteration ${i} failed: ${err.message}`);
    } finally {
      ws.close();
    }
  }

  return samples;
}
