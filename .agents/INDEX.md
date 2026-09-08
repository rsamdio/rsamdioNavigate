# NAVIGATE Codebase Index & Symbol Map

This index provides a fast, authoritative lookup map for all modules, services, pages, utilities, components, scripts, rules, and configurations across the monorepo to eliminate exploratory search overhead and prevent index drift.

---

## 1. `packages/common` (Shared Core Engine)
* [`package.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/package.json): Common package manifest defining `@serverless-tour/common` module exports and dependencies.
* [`tsconfig.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/tsconfig.json): TypeScript configuration for building common types and DOM utilities.
* [`src/index.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/src/index.ts): Main export file for the shared package exposing the types, DOM selector, DOM serializer, DOM rehydrator, and R2 client.
* [`src/types/demo.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/src/types/demo.ts): Core TypeScript definitions and schemas (`DemoDocument`, `StepDocument`, `TourManifest`, `StepManifest`, `GlobalStepSettings`, `TooltipDefaults`, `BeaconDefaults`, `ModalDefaults`, `DOMModification`, `StepAction`, `InputAction`, `BeaconConfig`, `FirebaseConfig`, `R2Config`, `UserRole`, `CreatorProfile`).
* [`src/types/snapshot.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/src/types/snapshot.ts): DOM Snapshot schema representing captured page states (`DOMSnapshot`, `ClickedElementInfo`, `RehydrationOptions`, `CaptureOptions`).
* [`src/constants/appConfig.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/src/constants/appConfig.ts): Static client-side production config values for Firebase Auth/Firestore, Cloudflare R2 bucket configurations, Google Analytics measurement ID (`APP_GA_MEASUREMENT_ID`), and IndexNow credentials (`APP_INDEXNOW_CONFIG`).
* [`src/dom/serializer.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/src/dom/serializer.ts): Captured step DOM serialization and sanitization utility (`generateCssSelector`, `generateXPath`, `getElementCoordinates`, `collectDocumentStyles`, `serializeDOM`, `captureDOMSnapshot`). Inlines WebP-scaled images and canvas states while scrubbing scripts/CSP tags.
* [`src/dom/rehydrator.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/src/dom/rehydrator.ts): Sandboxed iframe rehydration engine (`rehydrateIframeSnapshot`, `applyDOMModifications`, `simulateTypingInElement`, `findElementInSnapshot` with Euclidean closest-coordinate disambiguation, `computeTooltipPosition` with bidirectional `ObstacleRect` avoidance, `computeBeaconPosition`, `computeCardEdgePoint`). Translates static snapshots back to live, interactive pages without script execution traps.
* [`src/storage/r2Client.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/common/src/storage/r2Client.ts): S3-compatible R2 upload & fetch helpers (`createR2Client`, `uploadDOMSnapshotToR2`, `uploadManifestToR2`, `fetchManifestFromR2`). Used for publishing static JSON assets to Cloudflare CDN.

---

## 2. `packages/client` (React + Vite Web App)
### Configuration & Initialization
* [`package.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/package.json): Client package manifest declaring React 19, Lucide icons, Firebase SDK, and build toolchain.
* [`tsconfig.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/tsconfig.json): TypeScript compilation target configuration for Vite.
* [`vite.config.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/vite.config.ts): Vite build config for the client application.
* [`tailwind.config.js`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/tailwind.config.js): Tailwind CSS design system tokens matching RSA Navy (`#0c3c60`) and slate palette.
* [`postcss.config.js`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/postcss.config.js): PostCSS pipeline configuration for Tailwind and Autoprefixer.
* [`index.html`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/index.html): HTML5 entry document with preloaded fonts, Google Analytics 4 (`G-QZDYH5YMXH`), SEO meta tags, and root container `#root`.
* [`public/e4b54e7e62a343df89961d1ea009e530.txt`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/public/e4b54e7e62a343df89961d1ea009e530.txt): IndexNow domain ownership verification key file for search engine push indexing.
* [`src/main.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/main.tsx): Entry point rendering the React application root.
* [`src/index.css`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/index.css): Core global styling, Tailwind directives, glassmorphic card utilities, and animation keyframes.
* [`src/vite-env.d.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/vite-env.d.ts): TypeScript environment definitions for Vite client assets.

### Pages & Router
* [`src/App.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/App.tsx): Main application router and shell with Google Analytics 4 SPA route tracker (`AnalyticsTracker`) declaring routes for the landing page, preview player, auth pages, and editor:
  * `/` -> `PublicLandingPage`
  * `/view/:demoId` -> `PublicTourPlayer`
  * `/admin` -> `Dashboard` (Admin)
  * `/admin/login` -> `AdminAuthPage`
  * `/admin/editor/:demoId` -> `StudioEditor`
  * `/privacy` -> `PrivacyPolicyPage`
  * `/terms` -> `TermsPage`
* [`src/pages/PublicLandingPage.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/pages/PublicLandingPage.tsx): Rotaract South Asia MDIO Guide Directory offering user-facing categories, search filters, interactive walkthrough launch points, and live stats.
* [`src/pages/AdminAuthPage.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/pages/AdminAuthPage.tsx): Dedicated creator and super admin authentication interface with Google Sign-In and access request flows.
* [`src/pages/PrivacyPolicyPage.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/pages/PrivacyPolicyPage.tsx): Static privacy disclosure outlining extension DOM capturing privacy policies and data protection commitments.
* [`src/pages/TermsPage.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/pages/TermsPage.tsx): Static terms of service outlining walkthrough usage terms and content guidelines.

### Core Component Packages
* [`src/components/player/PublicTourPlayer.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/player/PublicTourPlayer.tsx): Full-bleed tour playback view consuming static JSON manifests from CDN ($0.00 database cost). Manages interactive iframe rehydration, spotlights, typing simulation, audio narration stream lifecycle with mute control, sticky 60fps tracking without thrashing, off-screen target center helpers, allowStepJumping enforcement, element-specific default step fallback resolution, and theme-adaptive modal styling.
* [`src/components/studio/StudioEditor.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/studio/StudioEditor.tsx): 3-pane walkthrough editor (Timeline panel with automatic step re-sequencing, Sandboxed Canvas editor with semantic element picking, self-healing snapshot recovery, DOM privacy masking, debounced manual save, Test Player loading feedback, dynamic publish confirmation dialog with custom slug shortcuts and live validation badges, guide unpublishing, Advanced tab with Simulated Input Typing form & canvas test trigger + Audio Narration controls, 2-tab Guide Settings modal with element-specific defaults configurator [Tooltip/Beacon/Modal], custom hex brand color picker, 1-click bulk step styling application, and theme-adaptive modal card mode).
* [`src/components/dashboard/Dashboard.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/dashboard/Dashboard.tsx): Admin guide manager panel containing guide status updates, search, filters, extension trigger bridges, and walkthrough cloning utilities.
* [`src/components/admin/AdminProtectedRoute.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/admin/AdminProtectedRoute.tsx): RBAC protective router component routing based on User Roles (Super Admin, Creator, Pending, Unauthorized).
* [`src/components/admin/AdminUserManagementModal.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/admin/AdminUserManagementModal.tsx): Super Admin modal for managing creator signups, approvals, role promotions, and revoking permissions.

### Shared Common UI Components
* [`src/components/common/Navbar.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/common/Navbar.tsx): Main application header containing RSA MDIO branding, public showcase links, extension download button, and user authentication dropdown selectors.
* [`src/components/common/AuthModal.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/common/AuthModal.tsx): Google OAuth authentication sign-in popup.
* [`src/components/common/LogoutConfirmModal.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/common/LogoutConfirmModal.tsx): Double-confirmation dialog preventing accidental sign-outs and guarding unsaved walkthrough changes.
* [`src/components/common/ConfigModal.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/common/ConfigModal.tsx): Settings overlay allowing real-time workspace overrides for Firebase and Cloudflare R2 configurations.
* [`src/components/common/LabelInput.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/common/LabelInput.tsx): Unified, accessible form input component with custom label and error states.
* [`src/components/common/CustomSelect.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/components/common/CustomSelect.tsx): Custom styled accessibility-compliant dropdown selector.

### Services & Data
* [`src/services/firebase.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/services/firebase.ts): Firebase initialization module. Handles authentication listeners, Firestore data access, and callable Cloud Function references (`callGetPresignedUploadUrl`, `callPublishTourManifest`, `callUnpublishTourManifest`, `callDeleteTourAssets`, `callSetUserRole`, `callVerifyAuthorizedCreator`).
* [`src/services/indexedDbService.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/services/indexedDbService.ts): Offline-first database service using client IndexedDB for local persistence of large drafts and captured DOM snapshots (`saveIdbSnapshot`, `getIdbSnapshot`, `getIdbSnapshotAny`, `findMatchingIdbSnapshot`, `getAllIdbSnapshotsForDemo`, `saveIdbDraft`, `getIdbDraft`, `deleteIdbDraft`, `deleteIdbSnapshotsForDemo`).
* [`src/services/demoService.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/services/demoService.ts): Persistence orchestrator between Remote Cloud Functions, Cloud Firestore, and Local IndexedDB fallbacks (`saveDraft`, `publishTour`, `unpublishDemo`, `deleteDemo`, `duplicateDemo`, `saveDemoAndStepsBatch`, `validateSlug`, `generateSlugFromTitle`, `RESERVED_SLUGS`, `fetchPublicManifest`, `extractSnapshotCandidateKeys`, `createDefaultBlankSnapshot`).
* [`src/services/configService.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/services/configService.ts): LocalStorage infrastructure configuration reader and offline simulator.
* [`src/sampleData/defaultDemos.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/sampleData/defaultDemos.ts): Static sample walkthrough metadata and starter guide structures.

### Utilities
* [`src/utils/imageUtils.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/utils/imageUtils.ts): Canvas-driven image compression helper converting custom uploads to lightweight WebP files before CDN storage upload (`convertImageToWebP`, `uploadCoverImage`).
* [`src/utils/seo.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/client/src/utils/seo.ts): Dynamic Search and Open Graph metadata parser for managing HTML headers on the fly (`updatePageMetadata`, `resetToDefaultMetadata`).

---

## 3. `packages/functions` (Firebase Cloud Functions)
* [`package.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/functions/package.json): Functions manifest declaring `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `firebase-admin`, and `firebase-functions`.
* [`tsconfig.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/functions/tsconfig.json): Node.js 18/20 TypeScript compiler configuration.
* [`.env`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/functions/.env): Server-side environment variables storing Cloudflare R2 bucket credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`).
* [`src/index.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/functions/src/index.ts): Main Cloud Functions entry point declaring backend endpoints:
  * `getPresignedUploadUrl`: Issues secure, short-lived Cloudflare R2 S3 pre-signed PUT URLs for client snapshot uploads.
  * `publishTourManifest`: Edge deployment orchestrator. Bundles walkthrough config, images, and HTML into a flat static bundle, writes directly to R2, and sends real-time push to IndexNow search engines.
  * `unpublishTourManifest`: Unpublishes walkthrough from Edge CDN, removes manifest from R2, sets `isPublished: false`, re-syncs catalog.json, and pushes de-indexing notice to IndexNow.
  * `deleteTourAssets`: Full cascading deletion using ListObjectsV2 to purge manifest and all step snapshots from R2, delete Firebase Storage drafts, drop Firestore subcollections/documents, and re-sync catalog.json.
  * `setUserRole`: Super Admin RBAC role updater.

---

## 4. `packages/ext-tour` (Chrome Extension MV3)
### Configuration & Layout
* [`package.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/package.json): Extension package manifest for building background worker, content script, and popup.
* [`tsconfig.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/tsconfig.json): TypeScript compilation config for Chrome Extensions.
* [`vite.config.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/vite.config.ts): Multi-entry Vite build configuration compiling popup, background service worker, and content recorder.
* [`manifest.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/manifest.json): Chrome Manifest V3 descriptor declaring host permissions (`activeTab`, `storage`, `unlimitedStorage`), background service worker, and popup.
* [`public/manifest.json`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/public/manifest.json): Static extension manifest bundled into extension distribution.
* [`popup.html`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/popup.html): HTML container for the extension toolbar popup interface.
* [`tailwind.config.js`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/tailwind.config.js): Tailwind styling token configuration for extension popup UI.
* [`postcss.config.js`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/postcss.config.js): PostCSS pipeline for extension CSS processing.
* [`src/vite-env.d.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/src/vite-env.d.ts): Extension TypeScript build context and Chrome API definitions.

### Popup UI
* [`src/popup/main.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/src/popup/main.tsx): React root mounting the extension popup.
* [`src/popup/Popup.tsx`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/src/popup/Popup.tsx): User interface offering recording status toggles, step counter, captured step list, and export-to-studio actions.
* [`src/popup/index.css`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/src/popup/index.css): Extension popup stylesheet with compact utility classes and font declarations.

### Background & Content Engine
* [`src/content/recorder.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/src/content/recorder.ts): DOM content recorder injected into host tabs. Captures page states, serialized stylesheets, element coordinates, CSS selectors, click events, and forwards them to the extension runtime. Suppresses recording widgets on studio routes (`/admin`, `/auth`, `/studio`).
* [`src/background/serviceWorker.ts`](file:///Users/zeospec/Dev/Code/RSANavigate/packages/ext-tour/src/background/serviceWorker.ts): Service worker controller managing extension messaging ports, recording state persistence, tab captures, and redirection hooks to NAVIGATE Studio across localhost, 127.0.0.1, and production domains.

---

## 5. Root Infrastructure, Security Rules & Scripts
### Security Rules & Deployment Configs
* [`firestore.rules`](file:///Users/zeospec/Dev/Code/RSANavigate/firestore.rules): Firestore RBAC security rules (Public read for published guides, verified creator draft permissions, and super admin full control).
* [`storage.rules`](file:///Users/zeospec/Dev/Code/RSANavigate/storage.rules): Firebase Storage security rules for draft media uploads.
* [`netlify.toml`](file:///Users/zeospec/Dev/Code/RSANavigate/netlify.toml): Netlify build configuration specifying publish directory, build command, SPA fallback redirects, and asset caching headers.
* [`firebase.json`](file:///Users/zeospec/Dev/Code/RSANavigate/firebase.json): Firebase project mapping connecting Firestore rules, Storage rules, and Functions configuration.
* [`.firebaserc`](file:///Users/zeospec/Dev/Code/RSANavigate/.firebaserc): Firebase project alias configuration mapping to `rotaract-south-asia-mdio`.
* [`firebase-storage-cors.json`](file:///Users/zeospec/Dev/Code/RSANavigate/firebase-storage-cors.json): CORS configuration definition for Firebase Storage.
* [`r2-cors.json`](file:///Users/zeospec/Dev/Code/RSANavigate/r2-cors.json): Cloudflare R2 bucket CORS configuration allowing pre-signed PUT uploads from client domains.
* [`tsconfig.base.json`](file:///Users/zeospec/Dev/Code/RSANavigate/tsconfig.base.json): Monorepo root TypeScript configuration base.
* [`package.json`](file:///Users/zeospec/Dev/Code/RSANavigate/package.json): Root monorepo workspace scripts orchestrating development, packaging, building, and harness verification.

### Automation & Verification Scripts
* [`scripts/submit-indexnow.js`](file:///Users/zeospec/Dev/Code/RSANavigate/scripts/submit-indexnow.js): Search engine push engine for the IndexNow protocol (Microsoft Bing, Yandex, Seznam.cz, Naver, Yep) supporting dynamic Edge catalog discovery, single URL submission, and Netlify CI production build hooks.
* [`scripts/harness-verify.js`](file:///Users/zeospec/Dev/Code/RSANavigate/scripts/harness-verify.js): Agent harness verification and drift detection engine checking TypeScript builds, client secret isolation, and complete `.agents/INDEX.md` synchronization.
* [`scripts/package-extension.js`](file:///Users/zeospec/Dev/Code/RSANavigate/scripts/package-extension.js): Extension packaging script compiling `packages/ext-tour` and creating 1-click downloadable `navigate-recorder-extension.zip` in `packages/client/public`.
* [`scripts/generate-icons.js`](file:///Users/zeospec/Dev/Code/RSANavigate/scripts/generate-icons.js): Icon generator script creating extension icons and PNG/WebP assets from SVG vector masters.

---

## 6. Agent Harness, Rules & Memory Registry
### Invariant Rules
* [`AGENTS.md`](file:///Users/zeospec/Dev/Code/RSANavigate/AGENTS.md): Primary Agent Workspace Controller defining package boundaries, operational invariants, sub-agents, and verification rules.
* [`.agents/rules/index-maintenance.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/rules/index-maintenance.md): Mandatory rule requiring complete, zero-drift synchronization of `.agents/INDEX.md` on every file/code structure modification and build.
* [`.agents/rules/architecture-invariants.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/rules/architecture-invariants.md): Core architectural invariants (Zero-database public playback, server-side secret isolation, free-tier discipline, DOM privacy integrity, and index sync).
* [`.agents/rules/code-style.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/rules/code-style.md): Styling and code conventions (RSA Navy `#0c3c60` palette, Tailwind 4, TypeScript strictness).

### Specialized Sub-Agent Personas
* [`.agents/agents/guide-architect.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/agents/guide-architect.md): Canvas UX, sandboxed DOM iframe mutation, typing simulator, and 60fps tooltip positioning.
* [`.agents/agents/edge-ops.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/agents/edge-ops.md): Cloudflare R2 Edge manifests, S3 pre-signed upload URLs, and Firebase Cloud Functions.
* [`.agents/agents/extension-eng.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/agents/extension-eng.md): MV3 Chrome Extension recorder, DOM capture serialization, and Studio communication.
* [`.agents/agents/security-guard.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/agents/security-guard.md): Auth tokens, RBAC roles, Firestore security rules, and client secret leak scans.

### Specialized Workspace Skills
* [`.agents/skills/guide-authoring/SKILL.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/skills/guide-authoring/SKILL.md): Studio canvas, DOM privacy redaction/blurring, simulated typing, branching, audio narration.
* [`.agents/skills/edge-deployment/SKILL.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/skills/edge-deployment/SKILL.md): Cloudflare R2 static manifest compilation, Firebase Functions deployment, Netlify CI/CD.
* [`.agents/skills/extension-dev/SKILL.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/skills/extension-dev/SKILL.md): Chrome Extension MV3 recorder, event capturing, and Studio communication.
* [`.agents/skills/security-rbac/SKILL.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/skills/security-rbac/SKILL.md): Firebase Auth tokens, Firestore security rules, creator review workflows.

### Architectural Decisions & Memory
* [`.agents/memory/decisions.md`](file:///Users/zeospec/Dev/Code/RSANavigate/.agents/memory/decisions.md): Preserved Architectural Decision Records (ADRs 001-005) preventing historical regression.
