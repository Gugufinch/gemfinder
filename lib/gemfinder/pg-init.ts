// lib/gemfinder/pg-init.ts
//
// Process-wide pg type parser configuration. Imported as a side-effect from
// every file that creates a pg Pool — runs ONCE per process because Node
// caches modules. The setTypeParser registrations affect all subsequent
// queries from all pools in the process.
//
// WHY THIS EXISTS:
//
// node-pg's default behavior: NUMERIC (oid 1700) and INT8/bigint (oid 20)
// are returned to JavaScript as STRINGS. The rationale is that JS's number
// type can't safely hold 64-bit integers or arbitrary-precision decimals.
// For our domain — Spotify follower counts (max ~hundreds of millions),
// scores (0-100), etc — Number is plenty precise.
//
// What broke without this: every persisted scout_candidate has score="45.2"
// (string), follower counts as strings, etc. Downstream `typeof candidate.score
// === 'number'` checks in:
//   - app/api/ar/scout/candidates/[id]/route.ts (approve/reject feedback capture)
//   - app/api/ar/scout/candidates/[id]/reenrich/route.ts (delta computation)
// always evaluated false, so scout_feedback.score_at_decision is NULL in
// EVERY row — silently poisoning the adaptive-learning training dataset.
// The reenrich delta also marks unchanged follower counts as "changed"
// because "60000" !== 60000 in strict equality.
//
// Found by the audit workflow (2026-05-28) — critical issue #6.

import { types as pgTypes } from 'pg';

// OID 20 = int8 (bigint). Used for COUNT(), large IDs, follower counts that
// could in theory overflow 32-bit. Number is safe up to 2^53 — ~9 quadrillion
// — which is well above any real-world value we'd ever see in this app.
pgTypes.setTypeParser(20, (v) => (v == null ? null : Number(v)));

// OID 1700 = numeric (arbitrary-precision decimal). Used for score (real),
// any DECIMAL/NUMERIC column. We never store values where the precision
// loss of float64 would matter.
pgTypes.setTypeParser(1700, (v) => (v == null ? null : Number(v)));
