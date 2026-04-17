#!/usr/bin/env node

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

// Check for --expose-gc
if (typeof global.gc !== 'function') {
  console.warn(
    'Tip: Run with --expose-gc for accurate memory measurements:\n' +
      '  node --expose-gc benchmarks/cli.js ...\n',
  );
}

const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');
const {run} = require('./harness/runner');

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('suite', {
    alias: 's',
    type: 'array',
    description: 'Suites to run',
    choices: [
      'startup',
      'first-build',
      'scaling',
      'concurrency',
      'memory',
      'hmr',
      'all',
    ],
    default: ['all'],
  })
  .option('scale', {
    type: 'string',
    description: 'Synthetic fixture scale',
    choices: ['small', 'medium', 'large', 'xlarge'],
    default: 'medium',
  })
  .option('fixture', {
    type: 'string',
    description: 'Fixture type to benchmark',
    choices: ['synthetic', 'real-world', 'scaffolded', 'all'],
    default: 'all',
  })
  .option('project', {
    type: 'array',
    description: 'Specific real-world projects to benchmark',
    default: [],
  })
  .option('iterations', {
    alias: 'n',
    type: 'number',
    description: 'Number of measured iterations per benchmark',
    default: 5,
  })
  .option('json', {
    type: 'boolean',
    description: 'Write results to JSON file',
    default: false,
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Output path for JSON results',
    default: path.join(__dirname, 'results', 'results.json'),
  })
  .option('maxWorkers', {
    type: 'number',
    description: 'Override Metro maxWorkers',
  })
  .option('keep-fixtures', {
    type: 'boolean',
    description: "Don't delete generated fixtures after run",
    default: false,
  })
  .option('skip-clone', {
    type: 'boolean',
    description: 'Reuse previously cloned real-world repos',
    default: false,
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Verbose output',
    default: false,
  })
  .example(
    '$0 --suite startup --scale small --fixture synthetic',
    'Quick startup test on small synthetic fixture',
  )
  .example(
    '$0 --suite hmr --fixture real-world --project bluesky',
    'HMR latency on the Bluesky app',
  )
  .example('$0 --suite scaling', 'Full scaling curve (synthetic only)')
  .example(
    '$0 --fixture scaffolded --suite startup',
    'Startup time for all scaffolded frameworks',
  )
  .example(
    '$0 --suite first-build --project expensify mattermost',
    'Compare first-build for two real apps',
  )
  .example('$0 --json', 'Full run, write results to file')
  .help()
  .alias('help', 'h')
  .parse();

run({
  suites: argv.suite,
  scale: argv.scale,
  fixture: argv.fixture,
  projects: argv.project,
  iterations: argv.iterations,
  json: argv.json,
  outputPath: argv.output,
  maxWorkers: argv.maxWorkers,
  keepFixtures: argv['keep-fixtures'],
  skipClone: argv['skip-clone'],
  verbose: argv.verbose,
})
  .then(results => {
    console.log(`\nCompleted: ${results.length} measurements.`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`\nBenchmark failed: ${err.message}`);
    if (argv.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  });
