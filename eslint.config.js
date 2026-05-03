// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      // Allow explicit `any` in tests and infrastructure adapters
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Domain purity: restrict infrastructure imports ONLY in domain/application files
    files: [
      'src/shared/domain/**/*.ts',
      'src/shared/application/**/*.ts',
      'src/modules/*/domain/**/*.ts',
      'src/modules/*/application/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['typeorm', 'express', '*-orm'],
              message:
                'Domain must stay pure — no infrastructure imports allowed.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    // Relax rules for test files
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
);
