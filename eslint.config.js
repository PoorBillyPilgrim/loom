import js from "@eslint/js";
import pluginRouter from "@tanstack/eslint-plugin-router";
import eslintConfigPrettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const USE_ALIAS = "Import from @/… instead.";

export default defineConfig([
  globalIgnores([
    "dist",
    ".wrangler",
    "coverage",
    "migrations",
    "src/routeTree.gen.ts",
    "worker-configuration.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      pluginRouter.configs["flat/recommended"],
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "jsx-a11y": {
        // Mantine components and the HTML element each one renders
        components: {
          ActionIcon: "button",
          Anchor: "a",
          Avatar: "img",
          Button: "button",
          Checkbox: "input",
          FileInput: "input",
          Image: "img",
          Link: "a",
          NativeSelect: "select",
          PasswordInput: "input",
          Select: "input",
          Switch: "input",
          Title: "h1",
          TextInput: "input",
          Textarea: "textarea",
          UnstyledButton: "button",
        },
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      // TanStack Router redirects and 404s by throwing these
      "@typescript-eslint/only-throw-error": [
        "error",
        {
          allow: [
            {
              from: "package",
              package: "@tanstack/router-core",
              name: ["Redirect", "NotFoundError"],
            },
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^#/", message: USE_ALIAS },
            { regex: "^(\\.\\./)+src(/|$)", message: USE_ALIAS },
          ],
        },
      ],
      // Same as biblioboard-author-panel, after Mantine's own eslint config
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/control-has-associated-label": "off",
      "jsx-a11y/mouse-events-have-key-events": "off",
      "jsx-a11y/label-has-for": "off",
      "jsx-a11y/anchor-is-valid": "off",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/anchor-has-content": "off",
    },
  },
  {
    // Vitest types asymmetric matchers like expect.stringMatching() as any
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  eslintConfigPrettier,
]);
