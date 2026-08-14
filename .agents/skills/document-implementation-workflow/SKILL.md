---
name: document-implementation-workflow
description: "Plan and implement requirements from a provided document against the current repository. Use when asked to implement a PRD, specification, design document, requirements document, or documentation-driven feature with repeated acceptance and coverage review."
argument-hint: "Provide the document path or requirement text to implement."
---

# Document Implementation Workflow

Turn a provided requirements document into a complete, repository-aligned implementation. Treat the document as the source of truth and do not consider the work complete until every requirement is explicitly accounted for after the final acceptance pass.

## Inputs and Scope

1. Read the provided document in full. If it references other documents, interfaces, assets, acceptance criteria, or repository paths needed to interpret a requirement, read those too.
2. Inspect only the repository areas that directly own the requested behavior, plus their nearby tests and project validation commands.
3. Preserve existing repository conventions, public contracts, and unrelated user changes. If requirements conflict with the current codebase or are materially ambiguous, state the conflict and ask the user for the decision before implementation.

## Build a Coverage Plan

Before editing, produce a concise implementation plan that maps every actionable document requirement to:

- the owning code area or file;
- the intended implementation change;
- the acceptance check that proves it; and
- dependencies or sequencing constraints.

Give each requirement a stable identifier such as `R1`, `R2`, and retain it through implementation and acceptance. Include explicit non-code deliverables such as documentation, migrations, configuration, and tests. Do not infer a requirement is covered merely because a nearby change appears related.

## Implement One Plan Item at a Time

For each unaccepted plan item, repeat this loop:

1. Read the relevant local code and test surface. Form one falsifiable hypothesis about the smallest change that satisfies the mapped requirements.
2. Make the smallest coherent implementation change, following repository conventions.
3. Run the narrowest meaningful validation for that item: a targeted behavior test first, then applicable typecheck, lint, build, integration, or end-to-end checks as warranted by its impact.
4. Record the validation result against each requirement identifier touched by the item. Mark a requirement accepted only when its mapped acceptance check passes.
5. Re-read the provided requirements document in full after every accepted item. Compare every requirement identifier against the current implementation and evidence, including requirements not named in the item just completed.
6. When the reread reveals a missing, partial, contradicted, or unverified requirement, add or revise the plan item and return to step 1. Do not defer it silently and do not continue as though the original plan were complete.

## Reconciliation Rules

- A passing test does not establish document coverage by itself. Confirm the observed behavior, edge cases, data contracts, user-facing text, and operational requirements against the document.
- If an implementation change invalidates an earlier accepted item, reopen that item and rerun its acceptance check.
- Keep the plan current as discoveries change ownership or sequencing. New work uncovered by rereading the document is part of the same delivery scope unless the user explicitly removes it.
- Do not perform unrelated cleanup or refactors. Explain any necessary deviation from the document and obtain a decision when it affects user-visible behavior, architecture, scope, or acceptance criteria.

## Final Acceptance

After all plan items appear accepted:

1. Re-read the complete document once more.
2. Produce a final requirement-to-evidence checklist. Every requirement must be either accepted with a concrete validation result, explicitly rejected by the user, or blocked with the exact reason.
3. Run the repository's required validation suite and any requirement-specific checks. In this repository, run `pnpm typecheck`, `pnpm test`, and `pnpm exec eslint .` unless a check is unavailable or demonstrably irrelevant; report any such exception.
4. If any check fails or the final reread exposes a gap, reopen the affected plan item and repeat the implementation loop.
5. Finish only when the final checklist has no unaccounted requirements and all required validations pass, or when the user explicitly accepts documented blockers.

## Completion Report

Report:

- implemented plan items and their requirement identifiers;
- validation commands and results;
- the final document coverage result; and
- any user-approved exclusions or remaining blockers.