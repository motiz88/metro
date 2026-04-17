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
const {generateFixture, SCALE_PRESETS} = require('../fixtures/generator');
const {setupRealWorldProject, listProjects} = require('../fixtures/real-world/setup');
const {setupScaffoldedProject, listFrameworks} = require('../fixtures/scaffolded/setup');
const {printTable, writeJson} = require('./reporter');

const SUITES = {
  startup: require('../suites/startup.bench'),
  'first-build': require('../suites/first-build.bench'),
  scaling: require('../suites/scaling.bench'),
  concurrency: require('../suites/concurrency.bench'),
  memory: require('../suites/memory.bench'),
  hmr: require('../suites/hmr.bench'),
};

const TEMP_DIR = path.join(__dirname, '..', '.fixture-cache');

/**
 * Run the benchmark system.
 *
 * Lifecycle: Setup -> Generate/Clone -> Run -> Report -> Teardown
 *
 * @param {Object} options
 * @param {string[]} options.suites - suite names, or ['all']
 * @param {string} options.scale - fixture scale preset
 * @param {string} options.fixture - 'synthetic', 'real-world', 'scaffolded', or 'all'
 * @param {string[]} options.projects - specific real-world project names
 * @param {number} options.iterations
 * @param {boolean} options.json - write results JSON
 * @param {string} options.outputPath
 * @param {number} options.maxWorkers
 * @param {boolean} options.keepFixtures
 * @param {boolean} options.skipClone
 * @param {boolean} options.verbose
 * @returns {Promise<Object[]>} all results
 */
async function run(options) {
  const {
    suites: suiteNames = ['all'],
    scale = 'medium',
    fixture = 'all',
    projects = [],
    iterations = 5,
    json = false,
    outputPath = path.join(__dirname, '..', 'results', 'results.json'),
    maxWorkers,
    keepFixtures = false,
    skipClone = false,
    verbose = false,
  } = options;

  const log = verbose ? console.log.bind(console) : () => {};
  const allResults = [];

  // Determine which suites to run
  const activeSuites =
    suiteNames.includes('all')
      ? Object.keys(SUITES)
      : suiteNames.filter(s => SUITES[s]);

  const configOverrides = {};
  if (maxWorkers != null) {
    configOverrides.maxWorkers = maxWorkers;
  }

  console.log(`\nMetro Benchmarks`);
  console.log(`Suites: ${activeSuites.join(', ')}`);
  console.log(`Fixture types: ${fixture}`);
  console.log(`Iterations: ${iterations}`);
  console.log();

  // ── Phase: Synthetic fixtures ────────────────────────────────────────

  if (fixture === 'synthetic' || fixture === 'all') {
    const moduleCount =
      typeof scale === 'number'
        ? scale
        : SCALE_PRESETS[scale] ?? SCALE_PRESETS.medium;

    // For most suites, generate a single fixture at the requested scale
    if (activeSuites.some(s => s !== 'scaling')) {
      const syntheticDir = path.join(TEMP_DIR, `synthetic_${moduleCount}`);
      if (!fs.existsSync(path.join(syntheticDir, 'index.js'))) {
        log(`Generating synthetic fixture (${moduleCount} modules)...`);
        fs.mkdirSync(syntheticDir, {recursive: true});
        await generateFixture({
          outputDir: syntheticDir,
          scale: moduleCount,
          seed: 42,
        });
      }

      const syntheticContext = {
        fixtureDir: syntheticDir,
        entryPoint: path.join(syntheticDir, 'index.js'),
        fixtureName: `synthetic/${moduleCount}`,
      };

      for (const suiteName of activeSuites) {
        if (suiteName === 'scaling') continue; // scaling generates its own
        console.log(`Running ${suiteName} on synthetic/${moduleCount}...`);
        try {
          const suiteResults = await SUITES[suiteName](syntheticContext, {
            iterations,
            ...configOverrides,
          });
          allResults.push(...suiteResults);
        } catch (err) {
          console.error(`Error in ${suiteName}/synthetic: ${err.message}`);
          if (verbose) console.error(err.stack);
        }
      }
    }

    // Scaling suite generates its own fixtures at multiple scales
    if (activeSuites.includes('scaling')) {
      console.log('Running scaling suite...');
      try {
        const scalingResults = await SUITES.scaling(
          {fixtureDir: '', entryPoint: '', fixtureName: 'synthetic'},
          {iterations, tempDir: path.join(TEMP_DIR, 'scaling'), ...configOverrides},
        );
        allResults.push(...scalingResults);
      } catch (err) {
        console.error(`Error in scaling: ${err.message}`);
        if (verbose) console.error(err.stack);
      }
    }
  }

  // ── Phase: Real-world fixtures ───────────────────────────────────────

  if (fixture === 'real-world' || fixture === 'all') {
    const availableProjects = listProjects().map(p => p.name);
    const targetProjects =
      projects.length > 0
        ? projects.filter(p => availableProjects.includes(p))
        : availableProjects;

    // Only run certain suites against real-world (skip scaling)
    const realWorldSuites = activeSuites.filter(s => s !== 'scaling');

    for (const projectName of targetProjects) {
      console.log(`Setting up real-world/${projectName}...`);
      try {
        const project = await setupRealWorldProject(projectName, {
          skipClone,
          verbose,
        });

        const rwContext = {
          fixtureDir: project.projectRoot,
          entryPoint: project.entryPoint,
          fixtureName: `real-world/${projectName}`,
        };

        for (const suiteName of realWorldSuites) {
          console.log(`Running ${suiteName} on real-world/${projectName}...`);
          try {
            const suiteResults = await SUITES[suiteName](rwContext, {
              iterations,
              ...configOverrides,
            });
            allResults.push(...suiteResults);
          } catch (err) {
            console.error(
              `Error in ${suiteName}/real-world/${projectName}: ${err.message}`,
            );
            if (verbose) console.error(err.stack);
          }
        }
      } catch (err) {
        console.error(
          `Failed to set up ${projectName}: ${err.message}`,
        );
        if (verbose) console.error(err.stack);
      }
    }
  }

  // ── Phase: Scaffolded fixtures ───────────────────────────────────────

  if (fixture === 'scaffolded' || fixture === 'all') {
    const frameworks = listFrameworks().map(f => f.name);

    // Only run certain suites (skip scaling)
    const scaffoldedSuites = activeSuites.filter(s => s !== 'scaling');

    for (const frameworkName of frameworks) {
      console.log(`Setting up scaffolded/${frameworkName}...`);
      try {
        const project = await setupScaffoldedProject(frameworkName, {
          skipCreate: skipClone,
          verbose,
        });

        const scaffContext = {
          fixtureDir: project.projectRoot,
          entryPoint: project.entryPoint,
          fixtureName: `scaffolded/${frameworkName}`,
        };

        for (const suiteName of scaffoldedSuites) {
          console.log(
            `Running ${suiteName} on scaffolded/${frameworkName}...`,
          );
          try {
            const suiteResults = await SUITES[suiteName](scaffContext, {
              iterations,
              ...configOverrides,
            });
            allResults.push(...suiteResults);
          } catch (err) {
            console.error(
              `Error in ${suiteName}/scaffolded/${frameworkName}: ${err.message}`,
            );
            if (verbose) console.error(err.stack);
          }
        }
      } catch (err) {
        console.error(
          `Failed to set up ${frameworkName}: ${err.message}`,
        );
        if (verbose) console.error(err.stack);
      }
    }
  }

  // ── Phase: Report ────────────────────────────────────────────────────

  console.log('\n=== Results ===\n');
  printTable(allResults);

  if (json) {
    writeJson(outputPath, allResults);
  }

  // ── Phase: Teardown ──────────────────────────────────────────────────

  if (!keepFixtures && fs.existsSync(TEMP_DIR)) {
    log('Cleaning up generated fixtures...');
    // Only clean synthetic and scaling, not real-world clones
    const syntheticDirs = fs
      .readdirSync(TEMP_DIR)
      .filter(d => d.startsWith('synthetic_') || d === 'scaling');
    for (const dir of syntheticDirs) {
      fs.rmSync(path.join(TEMP_DIR, dir), {recursive: true, force: true});
    }
  }

  return allResults;
}

module.exports = {run, SUITES};
