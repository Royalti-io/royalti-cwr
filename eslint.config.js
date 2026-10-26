import tseslint from 'typescript-eslint';

// The engine does no I/O: it takes bytes and returns bytes. These bans keep it that way,
// which the "nothing leaves your browser" claim relies on.
const banned = ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'navigator', 'eval', 'Function', 'EventSource', 'sendBeacon', 'process', 'require', 'Buffer'];

export default tseslint.config(...tseslint.configs.recommended, {
  files: ['src/**/*.ts'],
  rules: {
    'no-restricted-globals': ['error', ...banned.map(name => ({ name, message: 'The engine is pure: no I/O or host globals.' }))],
    'no-restricted-imports': ['error', { patterns: [{ group: ['node:*', 'fs', 'path', 'http', 'https', 'net', 'crypto'], message: 'No Node imports in the engine.' }] }],
    'no-restricted-properties': ['error', { object: 'globalThis', property: 'fetch', message: 'No network.' }],
  },
});
