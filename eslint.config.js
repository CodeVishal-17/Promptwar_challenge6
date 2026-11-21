import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Ways to turn a string into markup or inline style; the web app builds DOM nodes instead. */
const noHtmlStrings = {
  'no-restricted-properties': [
    'error',
    { property: 'innerHTML', message: 'Build nodes with h() from dom.ts; never parse HTML.' },
    { property: 'outerHTML', message: 'Build nodes with h() from dom.ts; never parse HTML.' },
    { property: 'insertAdjacentHTML', message: 'Build nodes with h() from dom.ts.' },
    { object: 'document', property: 'write', message: 'Build nodes with h() from dom.ts.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.property.name='setAttribute'][arguments.0.value='style']",
      message: 'The CSP blocks style attributes; use a class or el.style.prop (CSSOM).',
    },
  ],
};

/** Application source: type-aware strict rules plus limits that keep functions and files small. */
const SOURCE = ['server/src/**/*.ts', 'web/src/**/*.ts', 'shared/**/*.ts'];
const scoped = (configs) => configs.map((c) => ({ ...c, files: SOURCE }));

const sizeAndShape = {
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 4],
  'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  // Numbers in template strings are fine; anything else must be turned into text on purpose.
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
};

export default tseslint.config(
  // submission-video/ is local, git-ignored tooling for recording the demo video.
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.superpowers/', 'submission-video/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/**', 'scripts/**', 'tests/server/**', 'tests/fixtures/**', '*.{js,ts,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**', 'tests/web/**'],
    languageOptions: { globals: globals.browser },
  },
  { files: ['web/**'], rules: noHtmlStrings },
  ...scoped(tseslint.configs.strictTypeChecked),
  ...scoped(tseslint.configs.stylisticTypeChecked),
  {
    files: SOURCE,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: sizeAndShape,
  },
);
