# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is a Medplum-based charting/EHR web app ("Medplum Charting Demo", forked/customized as "seguimiento") for managing patient encounters, notes, and observations on top of the Medplum FHIR platform. The backend is a hosted Medplum server (see `src/config.ts`); there is no custom backend server in this repo — persistence, auth, and search all go through the Medplum API via `@medplum/core` / `@medplum/react`.

## Commands

- `npm run dev` — start the Vite dev server at `http://localhost:3000`
- `npm run build` — full production build: builds bots first (`build:bots`), then `tsc` type-check, then `vite build`
- `npm run build:bots` — compiles and bundles the Medplum Bots (`src/bots/**`) into `dist/bots`, then regenerates `data/core/example-bots.json` via `src/scripts/deploy-bots.ts`
- `npm run lint` / `npm run lint:fix` — ESLint over `src/` (uses `@medplum/eslint-config`)
- `npm test` — run all tests once with Vitest (`vitest run`)
- `npm run test:coverage` — run tests with coverage
- Run a single test file: `npx vitest run src/bots/core/general-encounter.test.ts`
- Run tests matching a name: `npx vitest run -t "Full response with problem list"`

There is no local Medplum server config committed; `.env` is generated automatically from `.env.defaults` by `vite.config.ts` if missing (do not assume `.env` exists in git).

## Architecture

### Two build targets from one `src/`

The `src` directory contains two logically separate things built by different toolchains:

1. **The React app** (`src/App.tsx`, `src/pages/**`, `src/components/**`) — built by Vite/`tsc` using `tsconfig.json` (bundler resolution, DOM lib, JSX).
2. **Medplum Bots** (`src/bots/core/**`) — small serverless functions that run *inside Medplum*, not in the browser. They're compiled separately with `tsconfig-bots.json` (CommonJS, Node-ish, `es2018` target) and bundled with `esbuild-script.mjs` (which externalizes everything in `@medplum/bot-layer`'s dependencies, since that layer is provided by the Medplum runtime). Each bot exports a single `handler(medplum, event)` function.

Never assume code in `src/bots` can import browser-only APIs, and never assume code outside `src/bots` runs inside the Medplum bot sandbox.

### Bot deployment pipeline

`npm run build:bots` does four things in sequence: clean `dist/`, type-check bots against `tsconfig-bots.json`, bundle each bot entry point with esbuild (CJS, targeting the bot-layer runtime), then run `src/scripts/deploy-bots.ts`, which reads both the bot source and compiled JS, base64-encodes them into FHIR `Binary` resources, and writes a transaction `Bundle` to `data/core/example-bots.json` (this generated file is gitignored). That bundle is what actually gets uploaded to a Medplum project via the "Upload Example Bots" UI flow in `UploadDataPage.tsx`, which also patches in bot/questionnaire references at upload time via string placeholder substitution (`$bot-<name>-reference`, `$bot-<name>-id`, `$<questionnaire-name>`).

Adding a new bot means: write the handler under `src/bots/core/`, add a `BotDescription` entry to the `Bots` array in `esbuild-script.mjs`'s implicit glob (any `src/**/*.ts` not ending in `test.ts`) and to `src/scripts/deploy-bots.ts`'s `Bots` array (with its subscription `criteria`, typically a `QuestionnaireResponse?questionnaire=$<name>` search).

### Encounter note bots (`src/bots/core/`)

Three bots (`general-encounter-note.ts`, `obstetric-encounter-note.ts`, `gynecology-encounter-note.ts`) each subscribe to `QuestionnaireResponse` submissions for a specific questionnaire and convert free-form answers into structured FHIR resources: `Observation` (vitals/measurements, including a special-cased combined blood-pressure Observation with systolic/diastolic components), `Condition` (diagnosis, and optionally a second "problem list" Condition), and `ClinicalImpression` (the free-text note). Shared resource-building logic lives in `charting-utils.ts` (`createObservations`, `createConditions`, `createClinicalImpression`, `createBundle`); unit conversions (BMI, height/weight normalization) live in `observation-utils.ts`. `createBundle` builds an **upsert** transaction — each resource's request URL is a conditional search (`getUpsertUrl`) keyed on `encounter` + `code`, so reprocessing a QuestionnaireResponse updates rather than duplicates resources.

When adding a new encounter-type bot, follow the existing pattern: parse `getQuestionnaireAnswers(response)`, map answer keys to LOINC-coded observation data, delegate resource creation to `charting-utils.ts` helpers, and return a single `executeBatch` bundle from the handler.

### React app structure

- `src/pages/` — route-level components wired up in `src/App.tsx` (patient search, patient detail, encounter detail, generic FHIR resource page, sign-in, landing, data upload).
- `src/components/` — the Encounter Chart is composed of three panels: clinical chart / patient history (`PatientDetails.tsx`, `PatientObservations.tsx`), the encounter note itself (`EncounterNoteDisplay.tsx`, `soapnote/SoapNote.tsx`, `ClinicalImpressionDisplay.tsx`), and encounter actions (`EncounterActions.tsx`, `actions/`). `graphs/` renders longitudinal Observation trends with Chart.js (`ObservationGraph.tsx` + `measurement-constants.ts` define which LOINC codes are plotted and how).
- `components/tasks/` renders `Task` FHIR resources (e.g. diagnostic report review, questionnaire completion) in worklist UIs.
- The app relies heavily on `@medplum/react` components (`AppShell`, `Document`, `ErrorBoundary`, resource displays) rather than building UI chrome from scratch — check what `@medplum/react` already provides before writing new generic UI.

### Data directory

`data/core/` holds FHIR bundles uploaded once to bootstrap a Medplum project: `encounter-types.json` (ValueSets/terminology), `encounter-note-questionnaires.json` (the Questionnaires the bots subscribe to — sourced from `Questionnaires/*.json`, which are gitignored), and the generated `example-bots.json`. `data/example/` holds synthetic patient data for demos/testing, uploaded via the same `UploadDataPage` flow. These uploads are one-time, manual, admin-style operations, not part of the normal app runtime.

### Testing

Bot logic is tested with Vitest using `@medplum/mock`'s `MockClient` as a fake FHIR server, with FHIR StructureDefinitions/SearchParameters indexed in `beforeAll` (see `general-encounter.test.ts`) so `MockClient` can validate/search resources realistically. Test fixtures for each bot live in `src/bots/core/test-data/`. There are no tests for the React components currently — testing is concentrated on the bots.
