<p><img src="brand/logo/talentral-logo-horizontal.svg" alt="Talentral" height="64"></p>

**Skills-to-Work Platform: train, prove, connect, work.**

Talentral gives training organisations one system to run cohort-based skills programmes, turns each learner's work into verified evidence of skill, and connects that verified talent to employers in Nigeria, across Africa and in the GCC. The flagship pilot is the Kirkira Innovation Hub iDICE Centre of Excellence in Katsina.

> **Name clearance.** "Talentral" replaces the earlier name, which is registered with CAC by another party. It is subject to a CAC name search and a trademark search (classes 9, 35, 41, 42) before incorporation. See section A1.5 of the plan.

## What is in this repository

The repository holds the plan the MVP will be built from and the brand identity. Application code starts with Sprint 0 (plan section C22.1).

| Path | Contents |
| --- | --- |
| [`docs/master-plan.md`](docs/master-plan.md) | The master plan in Markdown: the version to read and review on GitHub |
| [`docs/Talentral_Master_Plan_v3.1.docx`](docs/Talentral_Master_Plan_v3.1.docx) | The same plan as a Word document for sharing with partners |
| [`docs/assets/`](docs/assets) | Figures used by both versions |
| [`docs/master-plan-source/`](docs/master-plan-source) | The generator: one source that produces the .docx, the Markdown and the figures |
| [`brand/`](brand) | Logo set (SVG, PNG, favicon), the PDF brand guide, design tokens and their generator |

### The plan at a glance

| Part | Covers |
| --- | --- |
| **A. Strategic Concept** | Brand and company structure, customers, product suites, readiness model, Passport, GCC corridor, business model, go-to-market, governance, risks |
| **B. MVP Definition** | Release phasing, scope matrix, roles, journeys, epics with acceptance criteria, non-functional requirements, validation gates |
| **C. Technical Implementation** | Architecture decisions, system design, tenancy and RLS, data model, offline sync, credentials, matching, AI, APIs, security, UI foundations, CI/CD, sprint plan, budget |
| **D. Action Plan** | First 90 days, pilot journey, recommendation, naming registry, assumptions, glossary |

### The brand at a glance

The mark is a person with open arms forming the T of Talentral, with the dot as the head. Its gradient runs from violet (learning) through blue (proof) to teal (work). Start with [`brand/README.md`](brand/README.md) or the [PDF guide](brand/talentral-brand-guide.pdf).

## Rebuilding the documents

Never edit `docs/master-plan.md` or the `.docx` by hand. Edit the files in `docs/master-plan-source/` and rebuild:

```bash
cd docs/master-plan-source
npm install
npx playwright install chromium   # once, to render the figures
npm run fonts                     # optional: downloads the Inter font for the figures
npm run build                     # figures, then .docx and Markdown
```

| File | Role |
| --- | --- |
| `brand.js` | The brand and company name. Change it here and rebuild to rename everything, including the logo set |
| `meta.js` | Document version and date |
| `front.js`, `partA.js` to `partD.js` | Document content |
| `h.js` | Layout helpers: each one writes the Word element and its Markdown twin |
| `diagrams.js` | Renders the figures from HTML to PNG |
| `build.js` | Assembles the Word document, pre-fills its Contents page and writes the Markdown |
| `preview.js` | Renders the built .docx in Chromium for visual checks (`node preview.js <section>`) |

The brand assets rebuild from `brand/source` (see [`brand/README.md`](brand/README.md#rebuilding)). Rebuild the brand first when the name changes, because the documents embed the logo.

## Next step

Sprint 0, as defined in section C22.1: monorepo (pnpm and Turborepo), CI, environments, design tokens (from `brand/tokens.css`) and core components, architecture decision records, and the tenancy schema with Row-Level Security isolation tests.
