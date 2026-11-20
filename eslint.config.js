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

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.superpowers/'] },
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
);
