/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
  ignorePatterns: ["dist", "node_modules", "reference", "*.cjs"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
};
