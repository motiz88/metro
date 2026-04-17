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

// Scale presets: name -> module count
const SCALE_PRESETS = {
  small: 100,
  medium: 1000,
  large: 5000,
  xlarge: 10000,
};

/**
 * Simple seeded PRNG (linear congruential generator).
 * Produces deterministic sequences for reproducible fixtures.
 */
class SeededRandom {
  constructor(seed) {
    this._state = seed % 2147483647;
    if (this._state <= 0) this._state += 2147483646;
  }

  /** Returns a float in [0, 1). */
  next() {
    this._state = (this._state * 16807) % 2147483647;
    return (this._state - 1) / 2147483646;
  }

  /** Returns an integer in [min, max]. */
  nextInt(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Pick a random element from an array. */
  pick(arr) {
    return arr[this.nextInt(0, arr.length - 1)];
  }

  /** Shuffle an array in place (Fisher-Yates). */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ─── Code generation templates ───────────────────────────────────────────────

/**
 * Generate a Flow-typed CommonJS component (40% of modules).
 */
function generateFlowComponent(i, imports, rng) {
  const hookName = rng.pick(['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef']);
  const rnComponent = rng.pick(['View', 'Text', 'TouchableOpacity', 'ScrollView']);
  const animatedProp = rng.pick(['opacity', 'translateX', 'translateY', 'scale']);

  return `/**
 * @flow strict-local
 * @format
 */

'use strict';

import type {Node} from 'react';

const React = require('react');
const {${hookName}} = require('react');
const {${rnComponent}, StyleSheet, Platform, Animated} = require('react-native');
${imports.map(imp => `const ${imp.name} = require('${imp.path}');`).join('\n')}

type Props = {
  +title: string,
  +onPress?: () => void,
  +children?: Node,
  +testID?: string,
};

const animValue_${i}: Animated.Value = new Animated.Value(0);

function FlowComponent_${i}(props: Props): Node {
  const {title, onPress, children} = props;
  const isIOS: boolean = Platform.OS === 'ios';
  const label = isIOS ? title.toUpperCase() : title;

  ${hookName === 'useState' ? `const [count, setCount] = ${hookName}(${i % 100});` : ''}
  ${hookName === 'useEffect' ? `${hookName}(() => { const id = setTimeout(() => {}, ${i}); return () => clearTimeout(id); }, []);` : ''}
  ${hookName === 'useCallback' ? `const handlePress = ${hookName}(() => { onPress?.(); }, [onPress]);` : ''}
  ${hookName === 'useMemo' ? `const computed = ${hookName}(() => label + '_${i}', [label]);` : ''}
  ${hookName === 'useRef' ? `const ref = ${hookName}<typeof ${rnComponent} | null>(null);` : ''}

  return (
    <${rnComponent} style={styles.container}>
      <Animated.View style={{${animatedProp}: animValue_${i}}}>
        ${imports.map(imp => `<${imp.name} />`).join('\n        ')}
        {children}
      </Animated.View>
    </${rnComponent}>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: ${(i % 20) + 4},
    ${rng.next() > 0.5 ? `backgroundColor: '#${((i * 123456) & 0xFFFFFF).toString(16).padStart(6, '0')}',` : ''}
  },
});

module.exports = FlowComponent_${i};
`;
}

/**
 * Generate a TypeScript+JSX component (.tsx, 25% of modules).
 */
function generateTSXComponent(i, imports, rng) {
  const hook = rng.pick(['useState', 'useReducer', 'useContext', 'useMemo']);
  const rnApi = rng.pick(['Dimensions', 'PixelRatio', 'AppState']);

  return `import React, {${hook}} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ${rnApi},
  Platform,
  type ViewStyle,
} from 'react-native';
${imports.map(imp => `import ${imp.name} from '${imp.path}';`).join('\n')}

interface Item {
  id: string;
  label: string;
  value: number;
}

interface Props {
  title: string;
  items?: Item[];
  onSelect?: (item: Item) => void;
  style?: ViewStyle;
}

type Action =
  | {type: 'add'; item: Item}
  | {type: 'remove'; id: string}
  | {type: 'clear'};

function reducer(state: Item[], action: Action): Item[] {
  switch (action.type) {
    case 'add':
      return [...state, action.item];
    case 'remove':
      return state.filter(item => item.id !== action.id);
    case 'clear':
      return [];
  }
}

const TSXComponent_${i}: React.FC<Props> = ({title, items = [], onSelect, style}) => {
  ${hook === 'useState' ? `const [selected, setSelected] = useState<string | null>(null);` : ''}
  ${hook === 'useReducer' ? `const [state, dispatch] = useReducer(reducer, items);` : ''}
  ${hook === 'useMemo' ? `const sorted = useMemo(() => [...items].sort((a, b) => a.value - b.value), [items]);` : ''}
  const dimension = ${rnApi}.get('window');
  const isLandscape = dimension.width > dimension.height;

  const renderItem = ({item}: {item: Item}) => (
    <View style={styles.item}>
      <Text>{item.label}</Text>
    </View>
  );

  const keyExtractor = (item: Item) => item.id;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      {isLandscape && <Text>Landscape Mode</Text>}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
      />
      ${imports.map(imp => `<${imp.name} title="${imp.name}" />`).join('\n      ')}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: ${(i % 16) + 8},
  },
  title: {
    fontSize: ${(i % 12) + 14},
    fontWeight: 'bold' as const,
  },
  item: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
});

export default TSXComponent_${i};
`;
}

/**
 * Generate a plain ESM utility module (.js, 20% of modules).
 */
function generateESMUtility(i, rng) {
  const feature = rng.pick(['async', 'generator', 'class', 'proxy', 'weakref']);

  const asyncBlock = `
export async function fetchData_${i}(url) {
  const response = await fetch(url);
  const data = await response?.json() ?? {};
  return {
    ...data,
    timestamp: Date.now(),
    id: data?.id ?? '${i}',
  };
}

export const DEFAULT_CONFIG_${i} = Object.freeze({
  timeout: ${(i * 100) % 30000},
  retries: ${i % 5},
  baseUrl: \`https://api.example.com/v\${${i % 3 + 1}}\`,
});
`;

  const generatorBlock = `
export function* range_${i}(start = 0, end = ${i}, step = 1) {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}

export function* fibonacci_${i}() {
  let [a, b] = [0, 1];
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}
`;

  const classBlock = `
export class DataStore_${i} {
  #items = new Map();
  #version = 0;

  static INITIAL_CAPACITY = ${(i * 7) % 1000};

  constructor(initialItems = []) {
    for (const item of initialItems) {
      this.#items.set(item.id, item);
    }
  }

  get size() {
    return this.#items.size;
  }

  get [Symbol.toStringTag]() {
    return 'DataStore_${i}';
  }

  add(item) {
    this.#items.set(item.id, {...item, _version: ++this.#version});
    return this;
  }

  remove(id) {
    this.#items.delete(id);
    return this;
  }

  [Symbol.iterator]() {
    return this.#items.values();
  }
}
`;

  const proxyBlock = `
const handler_${i} = {
  get(target, prop, receiver) {
    if (typeof prop === 'string' && prop.startsWith('_')) {
      return undefined;
    }
    return Reflect.get(target, prop, receiver);
  },
  set(target, prop, value) {
    if (typeof prop === 'string' && prop.startsWith('_')) {
      throw new Error('Cannot set private property');
    }
    return Reflect.set(target, prop, value);
  },
};

export function createSafeObject_${i}(obj) {
  return new Proxy(obj, handler_${i});
}

export const COMPUTED_KEY_${i} = {
  [\`item_\${${i}}\`]: true,
  [\`prefix_\${'name_${i}'}\`]: '${i}',
};
`;

  const weakrefBlock = `
const registry_${i} = new FinalizationRegistry(heldValue => {
  console.log('Cleaned up:', heldValue);
});

export function createTracked_${i}(value) {
  const ref = new WeakRef(value);
  registry_${i}.register(value, 'tracked_${i}');
  return {
    deref: () => ref.deref(),
    isAlive: () => ref.deref() !== undefined,
  };
}

export const SYMBOL_KEY_${i} = Symbol('component_${i}');
export const SYMBOL_DESC_${i} = Symbol.for('shared_${i}');
`;

  const blocks = {async: asyncBlock, generator: generatorBlock, class: classBlock, proxy: proxyBlock, weakref: weakrefBlock};

  return `/**
 * Utility module ${i} -- ESM, modern JS syntax.
 */

${blocks[feature]}

// Destructuring with defaults and rest
export function processConfig_${i}({
  name = 'default_${i}',
  timeout = 1000,
  ...rest
} = {}) {
  const result = {name, timeout, extra: {...rest}};
  return result;
}

// Tagged template literal
function tag_${i}(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
}

export const tagged_${i} = tag_${i}\`item \${${i}} of \${'module_${i}'}\`;

// Logical assignment
export function updateDefaults_${i}(obj) {
  obj.name ??= 'unnamed_${i}';
  obj.count ||= 0;
  obj.items &&= obj.items.filter(Boolean);
  return obj;
}
`;
}

/**
 * Generate a screen module with dynamic imports (.js, 10% of modules).
 */
function generateDynamicScreen(i, componentIndices, rng) {
  const lazyImports = componentIndices.slice(0, 3).map(
    ci => `const Component_${ci} = React.lazy(() => import('./components/Component_${ci}'));`,
  );
  const directImports = componentIndices.slice(3);

  return `/**
 * @flow strict-local
 * @format
 */

'use strict';

const React = require('react');
const {Suspense} = require('react');
const {View, Text, ActivityIndicator} = require('react-native');
${directImports.map(ci => `const Component_${ci} = require('./components/Component_${ci}');`).join('\n')}

// Dynamic imports for code splitting
${lazyImports.join('\n')}

// Prefetch hint
const _prefetch_${i} = require.resolveWeak('./components/Component_${componentIndices[0]}');

function Screen_${i}(): React.Node {
  return (
    <View style={{flex: 1}}>
      <Text>Screen ${i}</Text>
      <Suspense fallback={<ActivityIndicator />}>
        ${componentIndices.slice(0, 3).map(ci => `<Component_${ci} title="lazy_${ci}" />`).join('\n        ')}
      </Suspense>
      ${directImports.map(ci => `<Component_${ci} title="direct_${ci}" />`).join('\n      ')}
    </View>
  );
}

module.exports = Screen_${i};
`;
}

/**
 * Generate an error boundary class component.
 */
function generateErrorBoundary() {
  return `/**
 * @flow strict-local
 * @format
 */

'use strict';

const React = require('react');
const {View, Text} = require('react-native');

type Props = {
  +children: React.Node,
  +fallback?: React.Node,
};

type State = {
  hasError: boolean,
  error: ?Error,
};

class ErrorBoundary extends React.Component<Props, State> {
  state: State = {hasError: false, error: null};

  static getDerivedStateFromError(error: Error): State {
    return {hasError: true, error};
  }

  componentDidCatch(error: Error, info: {componentStack: string}) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render(): React.Node {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
          <Text>Something went wrong</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

module.exports = ErrorBoundary;
`;
}

/**
 * Generate a custom hook module.
 */
function generateCustomHook(i, rng) {
  const hookType = rng.pick(['state', 'effect', 'callback', 'memo', 'context']);

  const hooks = {
    state: `
import {useState, useCallback} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

export function useToggle_${i}(initial: boolean = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue(v => !v), []);
  const setOn = useCallback(() => setValue(true), []);
  const setOff = useCallback(() => setValue(false), []);
  return {value, toggle, setOn, setOff} as const;
}
`,
    effect: `
import {useState, useEffect} from 'react';
import {Dimensions} from 'react-native';

export function useDimensions_${i}() {
  const [dims, setDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({window}) => {
      setDims(window);
    });
    return () => sub?.remove();
  }, []);

  return dims;
}
`,
    callback: `
import {useCallback, useRef} from 'react';

export function useDebounce_${i}<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = ${(i * 50) % 500 + 100},
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => fn(...args), delay);
    }) as T,
    [fn, delay],
  );
}
`,
    memo: `
import {useMemo} from 'react';

export function useSorted_${i}<T>(
  items: T[],
  compareFn: (a: T, b: T) => number,
): T[] {
  return useMemo(() => [...items].sort(compareFn), [items, compareFn]);
}

export function useFiltered_${i}<T>(
  items: T[],
  predicate: (item: T) => boolean,
): T[] {
  return useMemo(() => items.filter(predicate), [items, predicate]);
}
`,
    context: `
import React, {createContext, useContext, useState, type ReactNode} from 'react';

interface ThemeContext_${i} {
  isDark: boolean;
  toggle: () => void;
  colors: {bg: string; fg: string};
}

const Ctx = createContext<ThemeContext_${i} | null>(null);

export function ThemeProvider_${i}({children}: {children: ReactNode}) {
  const [isDark, setIsDark] = useState(false);
  const toggle = () => setIsDark(d => !d);
  const colors = isDark
    ? {bg: '#000', fg: '#fff'}
    : {bg: '#fff', fg: '#000'};

  return (
    <Ctx.Provider value={{isDark, toggle, colors}}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme_${i}(): ThemeContext_${i} {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme_${i} must be inside ThemeProvider_${i}');
  return ctx;
}
`,
  };

  return hooks[hookType];
}

/**
 * Generate shared utility files (helpers, constants, theme).
 */
function generateSharedUtils() {
  const helpers = `/**
 * @flow strict-local
 * @format
 */
'use strict';

function format(value: string): string {
  return value.trim().toLowerCase();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function truncate(value: string, maxLength: number = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) + '...' : value;
}

module.exports = {format, capitalize, truncate};
`;

  const constants = `/**
 * @flow strict-local
 * @format
 */
'use strict';

const PREFIX: string = 'bench';
const VERSION: string = '1.0.0';
const MAX_ITEMS: number = 1000;
const EMPTY_OBJECT: {||} = Object.freeze({});
const EMPTY_ARRAY: $ReadOnlyArray<empty> = Object.freeze([]);

module.exports = {PREFIX, VERSION, MAX_ITEMS, EMPTY_OBJECT, EMPTY_ARRAY};
`;

  const theme = `import {Platform} from 'react-native';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const colors = {
  primary: Platform.select({ios: '#007AFF', android: '#6200EE', default: '#0066CC'}),
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E0E0E0',
  error: '#FF3B30',
  success: '#34C759',
};

export type ThemeColors = typeof colors;
export type Spacing = typeof spacing;
`;

  const services = `/**
 * API service module -- async patterns.
 */

const BASE_URL = 'https://api.example.com';

export async function get(endpoint, params = {}) {
  const url = new URL(endpoint, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
  }
  return response.json();
}

export async function post(endpoint, body) {
  const response = await fetch(new URL(endpoint, BASE_URL).toString(), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  return response.json();
}

export class ApiClient {
  #baseUrl;
  #headers;

  constructor(baseUrl = BASE_URL, headers = {}) {
    this.#baseUrl = baseUrl;
    this.#headers = headers;
  }

  async request(method, endpoint, body) {
    const response = await fetch(new URL(endpoint, this.#baseUrl).toString(), {
      method,
      headers: {...this.#headers, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
    return response?.json() ?? null;
  }
}
`;

  return {helpers, constants, theme, services};
}

/**
 * Generate a minimal AssetRegistry for asset imports.
 */
function generateAssetRegistry() {
  return `'use strict';

const assets = [];

function registerAsset(asset) {
  return assets.push(asset);
}

function getAssetByID(assetId) {
  return assets[assetId - 1];
}

module.exports = {registerAsset, getAssetByID};
`;
}

/**
 * Generate a 1x1 transparent PNG (smallest valid PNG).
 */
function generatePlaceholderPng() {
  // Minimal valid PNG: 1x1 transparent pixel
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c626000000002000198e1938a0000000049454e44ae426082',
    'hex',
  );
}

// ─── Main generator ──────────────────────────────────────────────────────────

/**
 * Generate a synthetic React Native project fixture.
 *
 * @param {Object} options
 * @param {string} options.outputDir - absolute path to write generated project
 * @param {'small'|'medium'|'large'|'xlarge'|number} options.scale - module count or preset
 * @param {number} [options.seed=42] - PRNG seed
 * @returns {Promise<{entryPoint: string, moduleCount: number, screenCount: number, fixtureDir: string}>}
 */
async function generateFixture(options) {
  const {outputDir, seed = 42} = options;
  const moduleCount =
    typeof options.scale === 'number'
      ? options.scale
      : SCALE_PRESETS[options.scale] ?? SCALE_PRESETS.medium;

  const rng = new SeededRandom(seed + moduleCount);

  // Compute structure
  const screenCount = Math.max(1, Math.ceil(moduleCount / 20));
  const componentCount = moduleCount - screenCount;
  const flowCount = Math.floor(componentCount * 0.4);
  const tsxCount = Math.floor(componentCount * 0.25);
  const esmCount = Math.floor(componentCount * 0.2);
  const dynamicScreenCount = Math.min(screenCount, Math.floor(componentCount * 0.1));
  const hookCount = Math.max(1, Math.floor(componentCount * 0.03));

  // Create directories
  const dirs = [
    'components',
    'screens',
    'utils',
    'hooks',
    'contexts',
    'services',
    'types',
    'assets',
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(outputDir, dir), {recursive: true});
  }

  // Write shared utilities
  const shared = generateSharedUtils();
  fs.writeFileSync(path.join(outputDir, 'utils', 'helpers.js'), shared.helpers);
  fs.writeFileSync(
    path.join(outputDir, 'utils', 'constants.js'),
    shared.constants,
  );
  fs.writeFileSync(path.join(outputDir, 'utils', 'theme.ts'), shared.theme);
  fs.writeFileSync(
    path.join(outputDir, 'services', 'api.js'),
    shared.services,
  );

  // Write AssetRegistry
  fs.writeFileSync(
    path.join(outputDir, 'AssetRegistry.js'),
    generateAssetRegistry(),
  );

  // Write placeholder asset
  fs.writeFileSync(
    path.join(outputDir, 'assets', 'placeholder.png'),
    generatePlaceholderPng(),
  );

  // Write ErrorBoundary
  fs.writeFileSync(
    path.join(outputDir, 'components', 'ErrorBoundary.js'),
    generateErrorBoundary(),
  );

  // Generate components
  let componentIndex = 0;
  const allComponentNames = [];

  // Flow components (40%)
  for (let i = 0; i < flowCount; i++) {
    const ci = componentIndex++;
    const numImports = rng.nextInt(0, Math.min(3, ci));
    const imports = [];
    for (let j = 0; j < numImports; j++) {
      const target = rng.nextInt(0, Math.max(0, ci - 1));
      imports.push({
        name: `Component_${target}`,
        path: `./Component_${target}`,
      });
    }
    const code = generateFlowComponent(ci, imports, rng);
    fs.writeFileSync(
      path.join(outputDir, 'components', `Component_${ci}.js`),
      code,
    );
    allComponentNames.push(`Component_${ci}`);
  }

  // TSX components (25%)
  for (let i = 0; i < tsxCount; i++) {
    const ci = componentIndex++;
    const numImports = rng.nextInt(0, Math.min(2, allComponentNames.length));
    const imports = [];
    for (let j = 0; j < numImports; j++) {
      const target = rng.nextInt(0, Math.max(0, ci - 1));
      imports.push({
        name: `Component_${target}`,
        path: `./Component_${target}`,
      });
    }
    const code = generateTSXComponent(ci, imports, rng);
    fs.writeFileSync(
      path.join(outputDir, 'components', `Component_${ci}.tsx`),
      code,
    );
    allComponentNames.push(`Component_${ci}`);
  }

  // ESM utility modules (20%)
  for (let i = 0; i < esmCount; i++) {
    const ci = componentIndex++;
    const code = generateESMUtility(ci, rng);
    fs.writeFileSync(
      path.join(outputDir, 'components', `Component_${ci}.js`),
      code,
    );
    allComponentNames.push(`Component_${ci}`);
  }

  // Custom hooks
  for (let i = 0; i < hookCount; i++) {
    const code = generateCustomHook(i, rng);
    const ext = rng.next() > 0.5 ? '.ts' : '.tsx';
    fs.writeFileSync(
      path.join(outputDir, 'hooks', `useCustomHook_${i}${ext}`),
      code,
    );
  }

  // Generate screens
  for (let i = 0; i < screenCount; i++) {
    const componentsPerScreen = Math.min(
      20,
      Math.max(1, Math.floor(componentCount / screenCount)),
    );
    const startIdx = (i * componentsPerScreen) % Math.max(1, allComponentNames.length);
    const indices = [];
    for (let j = 0; j < componentsPerScreen; j++) {
      indices.push((startIdx + j) % Math.max(1, allComponentNames.length));
    }

    let code;
    if (i < dynamicScreenCount) {
      code = generateDynamicScreen(i, indices, rng);
    } else {
      // Regular screen with direct requires
      const imports = indices.map(ci => ({
        name: `Component_${ci}`,
        path: `../components/Component_${ci}`,
      }));
      code = generateFlowComponent(10000 + i, imports, rng)
        .replace(/FlowComponent_\d+/g, `Screen_${i}`);
    }
    fs.writeFileSync(
      path.join(outputDir, 'screens', `Screen_${i}.js`),
      code,
    );
  }

  // Generate NavigationRoot (imports all screens)
  const navImports = Array.from({length: screenCount}, (_, i) =>
    `const Screen_${i} = require('./screens/Screen_${i}');`,
  ).join('\n');
  const navScreens = Array.from({length: screenCount}, (_, i) =>
    `  Screen_${i}`,
  ).join(',\n');
  const navigationRoot = `/**
 * @flow strict-local
 * @format
 */
'use strict';

const React = require('react');
const {View} = require('react-native');
const ErrorBoundary = require('./components/ErrorBoundary');
${navImports}

const screens = [
${navScreens},
];

function NavigationRoot(): React.Node {
  return (
    <ErrorBoundary>
      <View style={{flex: 1}}>
        {screens.map((Screen, i) => (
          <Screen key={i} title={\`Screen \${i}\`} />
        ))}
      </View>
    </ErrorBoundary>
  );
}

module.exports = NavigationRoot;
`;
  fs.writeFileSync(path.join(outputDir, 'NavigationRoot.js'), navigationRoot);

  // Generate App entry with asset import
  const appEntry = `/**
 * @flow strict-local
 * @format
 */
'use strict';

const React = require('react');
const {View} = require('react-native');
const NavigationRoot = require('./NavigationRoot');

// Asset import to exercise the asset pipeline
const _placeholder = require('./assets/placeholder.png');

function App(): React.Node {
  return (
    <View style={{flex: 1}}>
      <NavigationRoot />
    </View>
  );
}

module.exports = App;
`;
  fs.writeFileSync(path.join(outputDir, 'App.js'), appEntry);

  // Generate index.js entry point
  const indexEntry = `/**
 * @format
 */
'use strict';

const App = require('./App');

// Entry point for Metro bundling
module.exports = App;
`;
  fs.writeFileSync(path.join(outputDir, 'index.js'), indexEntry);

  const entryPoint = path.join(outputDir, 'index.js');
  return {
    entryPoint,
    moduleCount: componentIndex + screenCount + hookCount + 6, // +6 for shared files
    screenCount,
    fixtureDir: outputDir,
  };
}

module.exports = {
  generateFixture,
  SCALE_PRESETS,
  SeededRandom,
};
