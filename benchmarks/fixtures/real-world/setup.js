/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const PINNED_VERSIONS = require('./pinned-versions.json');
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', '..', '.fixture-cache');

/**
 * Set up a real-world project for benchmarking.
 *
 * Clones the repo at the pinned tag, installs dependencies,
 * and patches the Metro config to use local workspace Metro packages.
 *
 * @param {string} projectName - key from pinned-versions.json
 * @param {Object} [options]
 * @param {string} [options.cacheDir] - directory to clone into
 * @param {boolean} [options.skipClone] - reuse existing clone
 * @param {boolean} [options.verbose] - log progress
 * @returns {Promise<{projectRoot: string, entryPoint: string, metroConfig: string, description: string}>}
 */
async function setupRealWorldProject(projectName, options = {}) {
  const {
    cacheDir = DEFAULT_CACHE_DIR,
    skipClone = false,
    verbose = false,
  } = options;

  const config = PINNED_VERSIONS[projectName];
  if (!config) {
    const available = Object.keys(PINNED_VERSIONS).join(', ');
    throw new Error(
      `Unknown project "${projectName}". Available: ${available}`,
    );
  }

  const projectDir = path.join(cacheDir, projectName);
  const log = verbose ? console.log.bind(console) : () => {};

  // Clone if needed
  if (!skipClone || !fs.existsSync(projectDir)) {
    log(`Cloning ${config.repo} at ${config.tag}...`);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, {recursive: true, force: true});
    }
    fs.mkdirSync(cacheDir, {recursive: true});

    execSync(
      `git clone --depth=1 --branch=${config.tag} https://github.com/${config.repo}.git ${projectDir}`,
      {
        stdio: verbose ? 'inherit' : 'pipe',
        timeout: 300000, // 5 min
      },
    );
  } else {
    log(`Reusing cached clone at ${projectDir}`);
  }

  // Install dependencies
  const nodeModulesDir = path.join(projectDir, 'node_modules');
  if (!skipClone || !fs.existsSync(nodeModulesDir)) {
    log(`Installing dependencies: ${config.installCmd}...`);
    execSync(config.installCmd, {
      cwd: projectDir,
      stdio: verbose ? 'inherit' : 'pipe',
      timeout: 600000, // 10 min
      env: {
        ...process.env,
        // Avoid native build steps that aren't needed for JS bundling
        SKIP_BUNDLING: '1',
        CI: '1',
      },
    });
  } else {
    log('Reusing cached node_modules');
  }

  // Patch Metro config to use local workspace packages
  patchMetroConfig(projectDir, config.metroConfig, log);

  return {
    projectRoot: projectDir,
    entryPoint: path.join(projectDir, config.entryPoint),
    metroConfig: path.join(projectDir, config.metroConfig),
    description: config.description,
    approxFiles: config.approxFiles,
  };
}

/**
 * Patch a project's metro.config.js to resolve Metro packages
 * from the local workspace instead of node_modules.
 */
function patchMetroConfig(projectDir, metroConfigRelPath, log) {
  const metroConfigPath = path.join(projectDir, metroConfigRelPath);
  if (!fs.existsSync(metroConfigPath)) {
    log(`Warning: ${metroConfigPath} not found, skipping patch`);
    return;
  }

  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const packagesDir = path.join(repoRoot, 'packages');

  // Write a wrapper config that merges the project's config with
  // our overrides for benchmarking
  const wrapperPath = metroConfigPath + '.bench-original.js';
  if (!fs.existsSync(wrapperPath)) {
    // Back up original
    fs.copyFileSync(metroConfigPath, wrapperPath);
  }

  const patchCode = `/**
 * Benchmark-patched Metro config.
 * Resolves Metro packages from the local workspace for testing.
 */
const path = require('path');
const originalConfig = require('./metro.config.bench-original.js');

const localMetroPackages = path.resolve('${packagesDir.replace(/\\/g, '\\\\')}');

// Resolve these Metro packages from the local workspace
const metroPackageNames = [
  'metro',
  'metro-babel-transformer',
  'metro-cache',
  'metro-cache-key',
  'metro-config',
  'metro-core',
  'metro-file-map',
  'metro-minify-terser',
  'metro-resolver',
  'metro-runtime',
  'metro-source-map',
  'metro-symbolicate',
  'metro-transform-plugins',
  'metro-transform-worker',
];

const extraNodeModules = {};
for (const pkg of metroPackageNames) {
  extraNodeModules[pkg] = path.join(localMetroPackages, pkg);
}

const config = typeof originalConfig === 'function'
  ? originalConfig
  : typeof originalConfig.then === 'function'
    ? originalConfig
    : originalConfig;

// For simple object configs
if (typeof config === 'object' && config !== null && typeof config.then !== 'function') {
  const resolver = config.resolver || {};
  module.exports = {
    ...config,
    cacheStores: [],
    reporter: {update() {}},
    resolver: {
      ...resolver,
      extraNodeModules: {
        ...resolver.extraNodeModules,
        ...extraNodeModules,
      },
      useWatchman: false,
    },
    watchFolders: [...(config.watchFolders || []), localMetroPackages],
  };
} else {
  // For async/function configs, export as-is with a note
  module.exports = config;
}
`;

  fs.writeFileSync(metroConfigPath, patchCode);
  log(`Patched ${metroConfigRelPath} to use local Metro packages`);
}

/**
 * List available real-world projects.
 */
function listProjects() {
  return Object.entries(PINNED_VERSIONS).map(([name, config]) => ({
    name,
    ...config,
  }));
}

/**
 * Clean up cached clones.
 */
function cleanCache(cacheDir = DEFAULT_CACHE_DIR) {
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, {recursive: true, force: true});
  }
}

module.exports = {
  setupRealWorldProject,
  listProjects,
  cleanCache,
  PINNED_VERSIONS,
};
