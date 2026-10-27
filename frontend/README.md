# XORCA Talent Intelligence — Frontend

React frontend for the XORCA Talent Intelligence prototype: CV NLP screening with evidence-linked job
matching, and an AI interview chatbot with rubric-based evaluation. HR stays in control: every score
links back to the CV text, missing information is shown as **"Not found in CV"** (never guessed), and
match scores describe fit with job criteria — not a prediction of job success.

## Stack

React 19 · TypeScript (strict) · Vite 8 · Tailwind CSS v4 · React Router 7 · TanStack Query 5 ·
React Hook Form + Zod 4 · Recharts 3 · lucide-react · Vitest + React Testing Library.

## Run it

Requirements: Node 24 and npm. The Flask API (`../backend`) should run on `http://localhost:5001`.

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:5001`, so no CORS setup is needed. The frontend
works without the backend running, but every page then shows its "can't reach the server" state.

### Configuration

Optional. Copy `.env.example` to `.env.local` to override:

| Variable            | Default           | Purpose                     |
| ------------------- | ----------------- | --------------------------- |
| `VITE_API_BASE_URL` | `/api/v1/talent`  | Base URL of the REST API    |

No API keys or secrets belong in the frontend: everything in `VITE_*` ends up in the browser bundle.

### No login

There is no sign-in screen: the app opens straight to the Dashboard and every HR action is available to
everyone. Authentication and permissions belong to the central system this app is handed to (see the root
`README.md`, "Deployment requirements for the central system"). The API attributes actions to the optional
`X-Actor-Name` / `X-Actor-Id` headers (default `HR`); in the central system these are set by its gateway.

## Scripts

| Command              | What it does                                   |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Vite dev server on port 5173 with the API proxy |
| `npm run build`      | Type-check (`tsc -b`) and production build     |
| `npm run preview`    | Serve the production build (port 4173, same proxy) |
| `npm run lint`       | ESLint (typescript-eslint, react-hooks)        |
| `npm test`           | Vitest + React Testing Library, single run     |
| `npm run test:watch` | Vitest in watch mode                           |

## Pages

| Route                                   | Page                                                          |
| --------------------------------------- | ------------------------------------------------------------- |
| `/login`                                | Removed, redirected to `/`                                    |
| `/`                                     | Dashboard: 4 KPIs (open jobs, applicants, AI interviews, hired + hire rate), monthly charts (applicants; jobs opened; AI interviews & hires), jobs overview, "Needs your attention" list |
| `/jobs`                                 | Jobs table: status, application period, applicants, form state; row actions (Form, Applicants, Edit, Add candidates manually, Interview templates, Close/Reopen, Delete). Clicking a job opens its form |
| `/jobs/new`, `/jobs/:id/edit`           | Job form (skills, education, weights); `?from=form` returns to the application form after saving |
| `/jobs/:id/form`                        | Application form builder (Google Forms style): publish / share link, title card, applicant-details card, question cards that preview as applicants see them and turn into editors on click (screening answer key, duplicate, Required switch), preview dialog |
| `/jobs/:id`, `/jobs/forms`              | Removed pages, redirected to `/jobs/:id/form` and `/jobs` |
| `/candidates`                           | Applicants table (one row per application) filtered by job/search, with match score and shortlist + bulk AI-interview invite per job |
| `/candidates/:id?application=ID`        | Single-page screening result: summary, score breakdown, requirement checklist, flags, profile, HR review, AI interviews |
| `/cv-screening[/results \| /forms/:jobId \| /upload]` | Legacy URLs, redirected to `/jobs`, `/candidates` or `/jobs/:id/form` |
| `/interviews`, `/interviews/:id`, `/interviews/:id/evaluation` | AI interview sessions, transcript, rubric evaluation |
| `/interviews/templates[/new | /:id]`    | Interview templates: suggest from job, competencies, rubric, questions, approval |
| `/analytics`                            | Removed page (merged into the dashboard), redirected to `/`   |
| `/settings`                             | Scoring weights, data retention, security & privacy, system status |
| `/interview#<token>`                    | Public candidate interview chatbot (no HR layout)             |

The candidate detail page supports deep links: `/candidates/12?application=34&tab=match`
(`tab` = `profile | skills | match | evidence | nlp | review | interviews`).

## Project structure

```
src/
  app/            router (lazy, code-split pages), providers, query client
  components/
    ui/           in-house component kit (Button, Card, Badge, Table, Tabs, Dialog, Toast, ScoreBadge, StatusBadge, ...)
    layout/       app shell: sidebar, mobile drawer, top bar, page header
    tables/       generic DataTable
    charts/       Recharts wrappers (ChartCard with empty state + table view)
  features/
    dashboard/ jobs/ candidates/ application-forms/ cv-upload/ shortlist/ interviews/ settings/ candidate-interview/
  services/       fetch-based API client, one module per API area, Zod schemas, query keys
  hooks/          TanStack Query hooks (hooks/queries) and small generic hooks
  types/api.ts    API contract shared with the backend
  utils/          formatting, labels, validation helpers
```

## How it works

- **API client** (`services/api-client.ts`): typed `fetch` wrapper (no `Authorization` header —
  access is controlled by the central system). Parses `ApiErrorBody` into an `ApiError` (`status`, `code`,
  `message`). Uploads use XHR to report real progress. The dashboard and the candidate interview state are
  validated at runtime with Zod schemas that are type-checked against `types/api.ts`.
- **Data fetching**: TanStack Query. Every page renders loading skeletons, an error card with retry,
  an empty state with a next step, and the data. Nothing on screen is hard-coded or sample data.
- **CV processing**: after an upload the UI polls `GET /documents/{id}/status` every ~1.5 s while the
  document is `queued`/`processing`, then refetches the application, screening and extraction.
- **Evidence**: extracted values carry the CV line they came from; clicking any excerpt opens the
  Evidence Viewer scrolled to that line and highlighted.
- **HR control**: requirement validations, reviews and profile corrections are sent as separate HR
  records — the AI output stays visible next to them.
- **No roles**: every HR action (create, upload, edit, approve, decide, delete) is shown to everyone;
  there is no user menu, role badge or logout, and no assigned-reviewer UI.
- **Candidate interview link**: `/interview#<token>`. The token is read from the URL fragment (never
  sent to a server in a URL) and only travels in the `X-Interview-Token` header.

## Tests

`npm test` runs the Vitest suite, including: API client error parsing and runtime validation, score and
status badges, "Not found in CV" rendering for null profile fields, the job form validation, the
dashboard empty/demo states and the candidate interview page (token from the hash, consent screen,
expired link).
