import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["**/data.js", "node_modules/**", ".venv/**"] },
  js.configs.recommended,
  {
    files: ["frontend/mockups/**/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      "no-unused-vars": "error",
      "no-constant-condition": "error",
      eqeqeq: ["error", "smart"],
    },
  },
];
