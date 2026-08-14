---
name: document-implementation-workflow
description: "Implement project code from a provided PRD, specification, or requirements document. Use when the document is the sole source of truth and every requirement must be implemented and verified before stopping."
argument-hint: "Provide the document path or requirement text to implement."
---

# Implement From Document

The provided document is the only source of truth. Your job is to implement its requirements in project code, not to improve or complete the document. Do not stop while any document requirement is missing, partial, contradicted, or unverified.

## Workflow

1. Read the entire document. Extract every actionable requirement and create an implementation plan that maps each one to code, tests, and a validation check.
2. Implement the next unverified requirement in the repository. Read the local code first, make the smallest coherent change, and run the narrowest relevant test or check.
3. Re-read the entire document after every implementation and validation. Compare each requirement to the current code and evidence.
4. Add every missing, partial, broken, or unverified requirement back to the plan. Reopen requirements affected by later changes.
5. Repeat steps 2 through 4 until the document contains no requirement without implemented and verified code.

## Rules

- Never treat a plan, a passing test, or one acceptance pass as completion by itself.
- Keep implementing automatically when rereading reveals a gap. Do not stop to report progress or ask whether to continue.
- Follow repository conventions and keep changes limited to what the document requires.
- Use the document to resolve product decisions. Ask the user only when the document itself is internally contradictory or cannot be implemented without a missing external value or credential.

## Finish

Before ending, re-read the full document one final time and verify every requirement against the implementation. Run all required project checks and requirement-specific validations. In this repository, run `pnpm typecheck`, `pnpm test`, and `pnpm exec eslint .`.

End only when all document requirements are implemented and verified, or when an external blocker makes implementation impossible. Report the implemented requirements, validation results, and any blocker.