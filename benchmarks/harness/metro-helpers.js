/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const http = require('http');
const path = require('path');
const {timeAsync} = require('./measure');

// Metro is required lazily to avoid loading it before it's needed,
// and to allow the benchmark harness to be loaded without Metro installed.
let Metro;
let metroConfig;

function requireMetro() {
  if (!Metro) {
    Metro = require('metro');
    metroConfig = require('metro-config');
  }
}

/**
 * Load a Metro config for a fixture directory, merging with the
 * benchmark defaults.
 *
 * @param {string} fixtureDir - absolute path to fixture project root
 * @param {Object} [overrides] - additional config overrides
 * @returns {Promise<Object>} merged Metro config
 */
async function loadBenchmarkConfig(fixtureDir, overrides = {}) {
  requireMetro();
  const {createBenchmarkConfig} = require('../metro.config');
  const benchConfig = createBenchmarkConfig(fixtureDir, overrides);
  const defaultConfig = await metroConfig.getDefaultConfig(fixtureDir);
  return metroConfig.mergeConfig(defaultConfig, benchConfig);
}

/**
 * Create a fully initialized Metro server, wait for ready.
 * Returns the server, config, and how long ready() took.
 *
 * @param {string} fixtureDir
 * @param {Object} [configOverrides]
 * @returns {Promise<{server: MetroServer, config: Object, readyDurationMs: number}>}
 */
async function createReadyServer(fixtureDir, configOverrides = {}) {
  requireMetro();
  const config = await loadBenchmarkConfig(fixtureDir, configOverrides);
  const {result: server, durationMs: readyDurationMs} = await timeAsync(
    'server.ready',
    async () => {
      const s = await Metro.runMetro(config, {waitForBundler: true});
      return s;
    },
  );
  return {server, config, readyDurationMs};
}

/**
 * Start a Metro HTTP server and return its URL and server objects.
 *
 * @param {string} fixtureDir
 * @param {Object} [configOverrides]
 * @returns {Promise<{httpServer: Object, metroServer: Object, config: Object, baseUrl: string, close: () => Promise<void>}>}
 */
async function startHttpServer(fixtureDir, configOverrides = {}) {
  requireMetro();
  const config = await loadBenchmarkConfig(fixtureDir, configOverrides);

  const {httpServer} = await Metro.runServer(config, {
    waitForBundler: true,
  });

  const address = httpServer.address();
  const baseUrl = `http://localhost:${address.port}`;

  return {
    httpServer,
    config,
    baseUrl,
    port: address.port,
    close: () =>
      new Promise(resolve => {
        httpServer.close(() => resolve());
      }),
  };
}

/**
 * Request a bundle from a running Metro HTTP server.
 *
 * @param {string} baseUrl - e.g. 'http://localhost:8081'
 * @param {string} bundlePath - e.g. 'index.bundle?platform=ios&dev=true&minify=false'
 * @returns {Promise<{statusCode: number, body: string, durationMs: number, contentLength: number}>}
 */
async function requestBundle(baseUrl, bundlePath) {
  const url = `${baseUrl}/${bundlePath}`;
  const {result, durationMs} = await timeAsync('requestBundle', () => {
    return new Promise((resolve, reject) => {
      const req = http.get(url, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          resolve({
            statusCode: res.statusCode,
            body,
            contentLength: body.length,
            headers: res.headers,
          });
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      // No timeout -- Metro can take a long time on large bundles
      req.setTimeout(0);
    });
  });
  return {...result, durationMs};
}

/**
 * Build a bundle using Metro.runBuild (no HTTP server).
 *
 * @param {Object} config - Metro config
 * @param {string} entry - entry file path relative to project root
 * @param {Object} [options]
 * @returns {Promise<{code: string, map: string, durationMs: number}>}
 */
async function buildBundle(config, entry, options = {}) {
  requireMetro();
  const {
    platform = 'ios',
    dev = true,
    minify = false,
  } = options;

  const {result, durationMs} = await timeAsync('runBuild', () =>
    Metro.runBuild(config, {
      entry,
      platform,
      dev,
      minify,
    }),
  );

  return {
    code: result.code,
    map: result.map,
    durationMs,
  };
}

/**
 * Build the module graph using Metro.buildGraph (no serialization).
 *
 * @param {Object} config - Metro config (InputConfigT)
 * @param {string[]} entries - entry file paths
 * @param {Object} [options]
 * @returns {Promise<{graph: Object, durationMs: number, moduleCount: number}>}
 */
async function buildGraph(config, entries, options = {}) {
  requireMetro();
  const {
    platform = 'ios',
    dev = true,
    minify = false,
  } = options;

  const {result: graph, durationMs} = await timeAsync('buildGraph', () =>
    Metro.buildGraph(config, {
      entries,
      platform,
      dev,
      minify,
    }),
  );

  return {
    graph,
    durationMs,
    moduleCount: graph.dependencies.size,
  };
}

module.exports = {
  loadBenchmarkConfig,
  createReadyServer,
  startHttpServer,
  requestBundle,
  buildBundle,
  buildGraph,
};
