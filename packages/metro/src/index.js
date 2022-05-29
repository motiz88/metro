/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

/*::
export type * from './index.flow';
*/

try {
  // $FlowFixMe[untyped-import]
  require('metro-babel-register').registerForMetroMonorepo();
} catch {}

module.exports = require('./index.flow');
