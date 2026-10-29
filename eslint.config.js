import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { dialogEarlyReturnRestrictedSyntax } from "./eslint-rules/dialogEarlyReturnRule.js";
import { strictLintDebtFiles } from "./eslint.strict-debt.js";
import { sharedLayerAllowlist, sharedLayerEnforcedFiles } from "./eslint.shared-layer-allowlist.js";

// Plan A (F1): the Runtime's path prefixes come from src/integrations/runtime/connection.ts, which
// picks the same-origin base or the loopback gateway's. A literal elsewhere would bypass that choice
// and fail on the hosted origin. Matches a string literal, or the text of a template literal.
const runtimePathPrefix = "/^\\/api\\/(runtime|astrid)(\\/|$)/";
const runtimePathRestrictedSyntax = {
  selector: `Literal[value=${runtimePathPrefix}], TemplateElement[value.cooked=${runtimePathPrefix}]`,
  message: "Build Runtime and Astrid paths from connection.ts (runtimeApiBase(), astridBase()) instead of a literal '/api/runtime' or '/api/astrid' path. A literal bypasses the hosted origin.",
};

// The cloud product is removed; nothing may bring the Supabase SDK back. This pattern lives on
// @typescript-eslint/no-restricted-imports, a different rule key from the shared-layer and URL-helper
// rules below, so it never replaces their options (flat config replaces a rule's options per file).
const supabaseSdkRestrictedPattern = {
  group: ["@supabase/*"],
  message: "The Supabase client was removed from the App. Use the Runtime or Astrid clients under src/integrations/.",
};

const urlHelperRestrictedPaths = [
  {
    name: "@/shared/lib/utils",
    importNames: ["getDisplayUrl", "stripQueryParameters"],
    message: "Import URL helpers from '@/shared/lib/mediaUrl'.",
  },
  {
    name: "./utils",
    importNames: ["getDisplayUrl", "stripQueryParameters"],
    message: "Import URL helpers from '@/shared/lib/mediaUrl'.",
  },
  {
    name: "../utils",
    importNames: ["getDisplayUrl", "stripQueryParameters"],
    message: "Import URL helpers from '@/shared/lib/mediaUrl'.",
  },
];

const strictRefreshFiles = [
  "src/app/**/*.{ts,tsx}",
  "src/shared/lib/debugPolling.ts",
  "src/shared/lib/mobileProjectDebug.ts",
  "src/shared/components/MediaGallery/hooks/useMediaGalleryDebugTools.ts",
  "src/shared/components/MediaLightbox/hooks/useVideoLightboxEnvironment.ts",
  "src/shared/components/MediaLightbox/hooks/useVideoLightboxRenderModel.tsx",
  "src/tools/travel-between-images/components/ShotImagesEditor/hooks/useShotImagesEditorCallbacks.ts",
  "src/tools/travel-between-images/components/ShotImagesEditor/hooks/useShotImagesEditorModel.ts",
];

export default tseslint.config(
  { ignores: ["dist", "eslint-rules/__fixtures__/**", "vendor/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": [
        "off",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "no-restricted-syntax": ["error", dialogEarlyReturnRestrictedSyntax],
    },
  },
  {
    files: strictRefreshFiles,
    rules: {
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
    },
  },
  // Runtime path boundary: only connection.ts (and tests, dev tooling) may spell /api/runtime or
  // /api/astrid. Repeats the dialog selector, since a block that sets no-restricted-syntax replaces it.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/integrations/runtime/connection.ts",
      "src/test/**",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.spec.ts",
      "src/**/*.spec.tsx",
      "src/**/__tests__/**/*.{ts,tsx}",
      "src/**/dev/**",
    ],
    rules: {
      "no-restricted-syntax": ["error", dialogEarlyReturnRestrictedSyntax, runtimePathRestrictedSyntax],
    },
  },
  // Test/example relaxations: these files are illustrative or test-only and
  // routinely use `any` for brevity and unused type imports for contract
  // surface documentation. Keep production code under the strict rules.
  {
    files: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/__tests__/**/*.{ts,tsx}",
      "src/examples/**/*.{ts,tsx}",
      "supabase/functions/ai-voice-prompt/index.test.ts",
      "tests/e2e/local/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  // Temporary strict-lint debt allowlist.
  // Rails are enabled globally, and only known legacy violations are allowlisted.
  // Keep this list shrinking over time; new violations outside this list fail lint.
  ...(strictLintDebtFiles.length > 0
    ? [{
      files: strictLintDebtFiles,
      rules: {
        "react-hooks/exhaustive-deps": "off",
        "react-hooks/rules-of-hooks": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": "off",
      },
    }]
    : []),
  // Utility boundary rule: keep URL helpers in their dedicated module.
  // Avoid importing these from shared/lib/utils (which now only hosts generic helpers).
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: urlHelperRestrictedPaths,
      }],
    },
  },
  // Architectural rule: shared/ should not import from tools/
  // This prevents coupling between the shared layer and tool-specific code.
  // Existing exceptions are documented in tasks/2026-02-02-shared-tools-cleanup.md
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    ignores: [
      "src/shared/**/__tests__/**/*.{ts,tsx}",
      "src/shared/**/*.test.ts",
      "src/shared/**/*.test.tsx",
      ...sharedLayerAllowlist,
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: urlHelperRestrictedPaths,
        patterns: [{
          group: ["@/tools/*", "**/tools/*"],
          message: "shared/ cannot import from tools/. Move the type/utility to shared/, or move the component to tools/. See tasks/2026-02-02-shared-tools-cleanup.md for documented exceptions."
        }],
      }]
    }
  },
  // Shared-layer dependency boundary:
  // shared/ should not take direct dependencies on feature/domain layers.
  // Existing legacy imports are temporarily tracked in a dedicated allowlist.
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    ignores: [
      "src/shared/**/__tests__/**/*.{ts,tsx}",
      "src/shared/**/*.test.ts",
      "src/shared/**/*.test.tsx",
      ...sharedLayerAllowlist,
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/features/*", "@/domains/*"],
          message: "shared/ is a foundational layer. Move feature/domain-aware logic into features/domains (or app composition), and keep shared consuming boundary-neutral contracts.",
        }],
      }],
    },
  },
  // Where the shared-layer rule is live. Before the cloud removal the Supabase facade block
  // replaced that rule's options for every `src` file outside its allowlist, so the rule only ever
  // fired on the files in `sharedLayerEnforcedFiles`; the other `src/shared` files have never been
  // checked (56 known `shared/ -> domains|features` violations in 51 files, owned debt; the
  // `shared/ -> tools/` pattern above is likewise replaced by this block's options and never fires).
  // This block restores exactly that coverage: outside the enforced files only the URL-helper paths
  // apply. Lift the mask by deleting this block once the 51 files are moved or allowlisted.
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    ignores: [
      "src/shared/**/__tests__/**/*.{ts,tsx}",
      "src/shared/**/*.test.ts",
      "src/shared/**/*.test.tsx",
      ...sharedLayerEnforcedFiles,
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: urlHelperRestrictedPaths,
      }],
    },
  },
  // Node builtin boundary (timeline dev-surface review §6.3): forbid `node:*`
  // and bare Node builtin imports under src/. A static Node builtin import
  // compiles fine but crashes the browser bundle at *import* time, because
  // Vite externalizes Node builtins into stubs that throw on first property
  // access -- this shipped as a real bug this week in
  // runtime/processes/ProcessManager.ts and jsonRpcStdioTransport.ts (both
  // statically imported node:child_process / node:util). The only legitimate
  // Node-adjacent module is runtime/processes/** (see the narrower carve-out
  // below); test files run under Node/Vitest, not the browser bundle, so
  // they're exempt.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/tools/video-editor/runtime/processes/**",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.spec.ts",
      "src/**/*.spec.tsx",
      "src/**/__tests__/**/*.{ts,tsx}",
      "src/test/**",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [{
          group: ["node:*"],
          message: "Node builtins are not available in the browser bundle: Vite externalizes them into stubs that throw at import time. Node-adjacent runtime code belongs under 'src/tools/video-editor/runtime/processes/**' and must resolve the module lazily via `process.getBuiltinModule`, not a static import.",
        }, supabaseSdkRestrictedPattern],
        paths: [
          "child_process", "util", "fs", "path", "os", "net", "stream", "buffer", "worker_threads",
        ].map((name) => ({
          name,
          message: "Node builtins are not available in the browser bundle: Vite externalizes them into stubs that throw at import time. Node-adjacent runtime code belongs under 'src/tools/video-editor/runtime/processes/**' and must resolve the module lazily via `process.getBuiltinModule`, not a static import.",
        })),
      }],
    },
  },
  // Node builtin boundary carve-out: runtime/processes/** legitimately
  // resolves node:child_process at runtime (lazily, via
  // `process.getBuiltinModule` -- see ProcessManager.ts's
  // `loadNodeChildProcess`), never via a static value import. Type-only
  // imports (e.g. `import type { ChildProcessWithoutNullStreams } from
  // 'node:child_process'`) are erased at compile time and never reach the
  // browser bundle, so they stay allowed here; static *value* imports of
  // node:* stay forbidden even in this directory, so the lazy-resolution
  // pattern can't quietly regress back to a static import. Test files in
  // this directory run under Node/Vitest and legitimately spawn real child
  // processes, so they're exempt.
  {
    files: ["src/tools/video-editor/runtime/processes/**/*.{ts,tsx}"],
    ignores: [
      "src/tools/video-editor/runtime/processes/**/*.test.ts",
      "src/tools/video-editor/runtime/processes/**/*.test.tsx",
      "src/tools/video-editor/runtime/processes/**/*.spec.ts",
      "src/tools/video-editor/runtime/processes/**/*.spec.tsx",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [{
          group: ["node:*"],
          allowTypeImports: true,
          message: "Resolve node:* modules lazily via `process.getBuiltinModule` (see ProcessManager.ts's loadNodeChildProcess) instead of a static value import -- a static import externalizes into a browser stub that throws at load time. Type-only imports are fine.",
        }, supabaseSdkRestrictedPattern],
        paths: [
          "child_process", "util", "fs", "path", "os", "net", "stream", "buffer", "worker_threads",
        ].map((name) => ({
          name,
          allowTypeImports: true,
          message: "Resolve Node builtins lazily via `process.getBuiltinModule` instead of a static value import -- a static import externalizes into a browser stub that throws at load time. Type-only imports are fine.",
        })),
      }],
    },
  },
  // Supabase SDK ban for the src files the Node builtin blocks above ignore (src/test, spec files).
  {
    files: ["src/test/**/*.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
    ignores: [
      "src/**/__tests__/**/*.{ts,tsx}",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [supabaseSdkRestrictedPattern],
      }],
    },
  }
);
