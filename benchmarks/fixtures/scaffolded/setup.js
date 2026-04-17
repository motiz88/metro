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

const DEFAULT_CACHE_DIR = path.join(__dirname, '..', '..', '.fixture-cache', 'scaffolded');

/**
 * Scaffolding framework definitions.
 */
const FRAMEWORKS = {
  expo: {
    displayName: 'Expo (default template)',
    createCmd: (dir) =>
      `npx create-expo-app@latest ${dir} --yes --no-install`,
    installCmd: 'npm install',
    entryPoint: 'app/_layout.tsx',
    hasExplicitMetroConfig: false,
    approxFiles: 37,
    description: 'Expo default template with file-based routing, tabs, hooks, theming',
  },
  'react-native-cli': {
    displayName: 'React Native Community CLI',
    createCmd: (dir) =>
      `npx @react-native-community/cli@latest init BenchApp --skip-install --skip-git-init --directory ${dir}`,
    installCmd: 'npm install',
    entryPoint: 'index.js',
    hasExplicitMetroConfig: true,
    approxFiles: 52,
    description: 'Vanilla RN from Community CLI, explicit metro.config.js',
  },
  ignite: {
    displayName: 'Ignite by Infinite Red',
    createCmd: (dir) =>
      `npx ignite-cli@latest new BenchApp --yes --installDeps=false --git=false --targetPath=${dir}`,
    installCmd: 'npm install',
    entryPoint: 'index.tsx',
    hasExplicitMetroConfig: true,
    approxFiles: 230,
    description: 'Ignite boilerplate: navigation, i18n, API layer, storage, devtools',
  },
};

/**
 * Set up a scaffolded app for benchmarking.
 *
 * @param {string} frameworkName - key from FRAMEWORKS
 * @param {Object} [options]
 * @param {string} [options.cacheDir] - directory to create apps in
 * @param {boolean} [options.skipCreate] - reuse existing scaffold
 * @param {boolean} [options.verbose] - log progress
 * @returns {Promise<{projectRoot: string, entryPoint: string, description: string}>}
 */
async function setupScaffoldedProject(frameworkName, options = {}) {
  const {
    cacheDir = DEFAULT_CACHE_DIR,
    skipCreate = false,
    verbose = false,
  } = options;

  const framework = FRAMEWORKS[frameworkName];
  if (!framework) {
    const available = Object.keys(FRAMEWORKS).join(', ');
    throw new Error(
      `Unknown framework "${frameworkName}". Available: ${available}`,
    );
  }

  const projectDir = path.join(cacheDir, frameworkName);
  const log = verbose ? console.log.bind(console) : () => {};

  // Create if needed
  if (!skipCreate || !fs.existsSync(projectDir)) {
    log(`Scaffolding ${framework.displayName}...`);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, {recursive: true, force: true});
    }
    fs.mkdirSync(cacheDir, {recursive: true});

    try {
      execSync(framework.createCmd(projectDir), {
        stdio: verbose ? 'inherit' : 'pipe',
        timeout: 120000, // 2 min
        env: {...process.env, CI: '1'},
      });
    } catch (err) {
      throw new Error(
        `Failed to scaffold ${frameworkName}: ${err.message}`,
      );
    }
  } else {
    log(`Reusing cached scaffold at ${projectDir}`);
  }

  // Install dependencies
  const nodeModulesDir = path.join(projectDir, 'node_modules');
  if (!skipCreate || !fs.existsSync(nodeModulesDir)) {
    log(`Installing dependencies: ${framework.installCmd}...`);
    execSync(framework.installCmd, {
      cwd: projectDir,
      stdio: verbose ? 'inherit' : 'pipe',
      timeout: 300000, // 5 min
      env: {
        ...process.env,
        SKIP_BUNDLING: '1',
        CI: '1',
      },
    });
  }

  // Patch Metro config to use local workspace packages
  patchMetroConfig(projectDir, framework, log);

  // Write AssetRegistry if missing (needed for synthetic config)
  const assetRegistryPath = path.join(projectDir, 'AssetRegistry.js');
  if (!fs.existsSync(assetRegistryPath)) {
    fs.writeFileSync(
      assetRegistryPath,
      `'use strict';\nconst assets = [];\nfunction registerAsset(a) { return assets.push(a); }\nfunction getAssetByID(id) { return assets[id - 1]; }\nmodule.exports = {registerAsset, getAssetByID};\n`,
    );
  }

  return {
    projectRoot: projectDir,
    entryPoint: path.join(projectDir, framework.entryPoint),
    description: framework.description,
    approxFiles: framework.approxFiles,
    framework: frameworkName,
  };
}

/**
 * Patch or create a metro.config.js for benchmarking.
 */
function patchMetroConfig(projectDir, framework, log) {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const packagesDir = path.join(repoRoot, 'packages');

  const metroConfigPath = path.join(projectDir, 'metro.config.js');

  if (framework.hasExplicitMetroConfig && fs.existsSync(metroConfigPath)) {
    // Back up and patch existing config
    const backupPath = metroConfigPath + '.bench-original.js';
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(metroConfigPath, backupPath);
    }

    const patchCode = createPatchCode(packagesDir, true);
    fs.writeFileSync(metroConfigPath, patchCode);
    log('Patched existing metro.config.js');
  } else {
    // Create a new metro.config.js
    const patchCode = createPatchCode(packagesDir, false);
    fs.writeFileSync(metroConfigPath, patchCode);
    log('Created metro.config.js for benchmarking');
  }
}

function createPatchCode(packagesDir, hasOriginal) {
  const escapedPath = packagesDir.replace(/\\/g, '\\\\');
  const originalRequire = hasOriginal
    ? `const originalConfig = require('./metro.config.bench-original.js');`
    : `const originalConfig = {};`;

  return `/**
 * Benchmark-patched Metro config.
 */
const path = require('path');
${originalRequire}

const localMetroPackages = path.resolve('${escapedPath}');

const metroPackageNames = [
  'metro', 'metro-babel-transformer', 'metro-cache', 'metro-cache-key',
  'metro-config', 'metro-core', 'metro-file-map', 'metro-minify-terser',
  'metro-resolver', 'metro-runtime', 'metro-source-map', 'metro-symbolicate',
  'metro-transform-plugins', 'metro-transform-worker',
];

const extraNodeModules = {};
for (const pkg of metroPackageNames) {
  extraNodeModules[pkg] = path.join(localMetroPackages, pkg);
}

const base = typeof originalConfig === 'object' && originalConfig !== null
  ? (originalConfig.__esModule ? originalConfig.default : originalConfig)
  : {};

module.exports = {
  ...base,
  cacheStores: [],
  reporter: {update() {}},
  resolver: {
    ...(base.resolver || {}),
    extraNodeModules: {
      ...(base.resolver?.extraNodeModules || {}),
      ...extraNodeModules,
    },
    useWatchman: false,
  },
  watchFolders: [...(base.watchFolders || []), localMetroPackages],
};
`;
}

/**
 * List available frameworks.
 */
function listFrameworks() {
  return Object.entries(FRAMEWORKS).map(([name, config]) => ({
    name,
    ...config,
  }));
}

/**
 * Clean up cached scaffolds.
 */
function cleanCache(cacheDir = DEFAULT_CACHE_DIR) {
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, {recursive: true, force: true});
  }
}

module.exports = {
  setupScaffoldedProject,
  listFrameworks,
  cleanCache,
  FRAMEWORKS,
};
