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

/**
 * Format a number with appropriate precision based on magnitude.
 */
function formatValue(value, unit) {
  if (unit === 'MB') {
    return value.toFixed(1);
  }
  if (unit === 'us') {
    return value.toFixed(0);
  }
  if (value >= 1000) {
    return value.toFixed(0);
  }
  if (value >= 100) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

/**
 * Print results as an aligned console table.
 *
 * Each result should have:
 *   { suite, fixture, metric, unit, value, stddev, min, max, median, p95, iterations, extra? }
 */
function printTable(results) {
  if (results.length === 0) {
    console.log('No results to display.');
    return;
  }

  const headers = ['Suite', 'Fixture', 'Metric', 'Value', 'StdDev', 'Median', 'Min', 'Max'];

  const rows = results.map(r => [
    r.suite,
    r.fixture,
    r.metric,
    `${formatValue(r.value, r.unit)}${r.unit}`,
    `\u00b1${formatValue(r.stddev, r.unit)}${r.unit}`,
    `${formatValue(r.median, r.unit)}${r.unit}`,
    `${formatValue(r.min, r.unit)}${r.unit}`,
    `${formatValue(r.max, r.unit)}${r.unit}`,
  ]);

  // Compute column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(row => row[i].length)),
  );

  // Print header
  const headerLine = headers
    .map((h, i) => h.padEnd(widths[i]))
    .join('  ');
  console.log(headerLine);
  console.log(widths.map(w => '\u2500'.repeat(w)).join('  '));

  // Print rows
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  '));
  }

  console.log();
}

/**
 * Convert results to the JSON format for archiving.
 * Uses customSmallerIsBetter-compatible schema.
 */
function toJson(results) {
  return results.map(r => ({
    name: `${r.suite}/${r.metric}/${r.fixture}`,
    unit: r.unit,
    value: r.value,
    range: `+/- ${formatValue(r.stddev, r.unit)}`,
    extra: [
      `median=${formatValue(r.median, r.unit)}`,
      `p95=${formatValue(r.p95, r.unit)}`,
      `min=${formatValue(r.min, r.unit)}`,
      `max=${formatValue(r.max, r.unit)}`,
      `iterations=${r.iterations}`,
      r.extra || '',
    ]
      .filter(Boolean)
      .join(' '),
  }));
}

/**
 * Write results to a JSON file.
 */
function writeJson(outputPath, results) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
  const json = toJson(results);
  fs.writeFileSync(outputPath, JSON.stringify(json, null, 2) + '\n');
  console.log(`Results written to ${outputPath}`);
}

module.exports = {
  printTable,
  toJson,
  writeJson,
  formatValue,
};
