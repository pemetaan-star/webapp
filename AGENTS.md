<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lingga Migration Context

`lingga` is a Next.js migration of the previous Google Apps Script project located in the sibling `next-app/GAS` folder. Treat the old project as the behavioral reference when porting features, field names, roles, validation rules, QC workflows, and data semantics.

Current architecture:

- Next.js owns the UI, Firebase Authentication, Firestore data, role-aware dashboards, enumerator forms, and QC workflows.
- Firestore collection `user` stores public profiles: `username`, `email`, `nama`, and `role`.
- Firestore collection `submissions` stores enumerator submissions and QC fields.
- The local `gas/code.gs` service is intentionally limited to document storage in Google Drive. Do not move login, KoboToolbox, Spreadsheet, QC, or dashboard logic into it.
- Documents are sent through `/api/documents/upload` to `gas/code.gs`; keep upload secrets server-side and never store passwords in Firestore.

When changing a migrated feature, compare it with the previous Apps Script implementation before changing its field names or role behavior. Preserve the role boundaries: Enumerator submits and reads own data; Koordinator/Data Analis/Admin review QC; Admin manages user profiles.
