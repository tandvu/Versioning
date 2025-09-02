module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  settings: { react: { version: 'detect' } },
  env: { browser: true, es2021: true },
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Allow explicit any in legacy code and small utilities to reduce churn
    '@typescript-eslint/no-explicit-any': 'off',
    // This is a TSX project; prop-types are unnecessary when using TypeScript types
    'react/prop-types': 'off',
    // Regex contains control characters (ANSI color escapes) used for log stripping
    'no-control-regex': 'off'
  }
};
