# Antigravity Execution Prompt — Windows 7 SP1 32-bit Desktop Release

## Mission

You are working inside the repository:

`aubed9/hesabdari`

Transform the current ARAYESHI / Kayhan Beauty Retail ERP from a local Node.js + Express + SQLite web application into a **fully installable, offline desktop application for Microsoft Windows 7 SP1 32-bit (x86)** without losing any existing business module, data, workflow, accounting rule, inventory rule, CRM capability, report, export, backup/restore behavior, or database history.

This is not a cosmetic wrapper task. Treat it as a production migration and release-hardening project.

The final result must be installable and usable by a non-technical shop operator on a Windows 7 SP1 32-bit machine without installing Node.js, npm, Git, Python, build tools, or any developer dependency.

Do not declare success from a development-machine smoke test. Success requires an x86 release artifact and evidence from a real Windows 7 SP1 32-bit test environment.

---

# 1. Non-negotiable compatibility target

Primary target:

- OS: Windows 7 SP1
- Architecture: x86 / 32-bit
- Offline operation: mandatory
- Internet access required for normal use: NO
- External runtime installation by end user: NO
- Installer target: x86
- Portable target: x86
- Persian/RTL UI: must remain fully functional
- Persian Windows username and paths containing spaces/non-ASCII characters: must work

Do not silently broaden the target to Windows 10/11 x64.

Electron 22.x may be used as a compatibility candidate because Electron 22 is the last Electron major that supports Windows 7/8/8.1, but do not assume that choosing Electron automatically satisfies this specification.

Before implementation, run a compatibility spike proving that the selected shell/runtime, SQLite binding, installer, and native modules can be built for **win32/ia32** and launched on Windows 7 SP1 32-bit.

If Electron is used:

- use an Electron 22.x line compatible with Windows 7;
- build `win32 ia32`, not x64;
- do not accidentally resolve/install a newer Electron major;
- pin exact working versions in package-lock.json;
- ensure every native module is compiled/rebuilt for Electron's ia32 ABI;
- produce a reproducible build script.

If another architecture is chosen, document why it provides stronger Windows 7 x86 reliability while preserving all functionality.

---

# 2. Current system that must be preserved

The current repository is a local Express application using SQLite.

Important existing components include:

- `server.js`
- `public/`
- `db/database.js`
- `db/migrator.js`
- `db/schema.sql`
- `db/migrations/`
- `services/accountingService.js`
- `services/posService.js`
- `services/inventoryService.js`
- `services/procurementService.js`
- `services/crmService.js`
- `services/marketingService.js`
- `services/reportService.js`
- `services/biService.js`
- `services/reconciliationService.js`
- `scripts/backup.js`
- `scripts/restore.js`
- `scripts/simulate90Days.js`
- `tests/`

The current application exposes these product areas and they must remain available:

- dashboard
- POS / sales
- products
- inventory
- purchasing / procurement
- omnichannel
- CRM
- marketing
- accounting
- reports
- BI
- audit
- alerts
- settings
- user/permission management

Do not remove modules because they are difficult to package.

Do not replace working domain logic with a simplified desktop implementation.

Reuse the current domain services and API behavior wherever technically possible.

---

# 3. Database and memory preservation is the highest priority

The application currently uses SQLite with WAL mode, foreign keys, migrations, integrity checks, backup/restore, and business invariants.

The user's database is persistent business memory. Losing or resetting it is a release-blocking failure.

## Required data design

The production database MUST NOT live inside:

- Program Files
- the packaged application directory
- Electron resources/app.asar
- a temporary directory
- the source repository directory

Create a single data-path abstraction.

Recommended structure:

`%LOCALAPPDATA%\\KayhanBeautyERP\\`

with subfolders such as:

- `data\\arayeshi_erp.sqlite3`
- `backups\\`
- `logs\\`
- `exports\\`
- `config\\`

The exact path can differ if there is a stronger Windows 7-safe choice, but application binaries and mutable business data must be separated.

All database-related code must obtain the DB path through one central helper/configuration layer.

Update:

- database initialization
- migrator
- backup
- restore
- tests
- simulation
- packaging
- any script that currently assumes `db/arayeshi_erp.sqlite3`

Do not leave multiple competing database locations.

## First-run legacy migration

If an existing legacy database is found in the repository/application folder:

`db/arayeshi_erp.sqlite3`

the desktop application must provide a safe one-time migration into the persistent user-data directory.

Migration procedure must:

1. never mutate the source file first;
2. perform `PRAGMA integrity_check`;
3. perform `PRAGMA foreign_key_check`;
4. create a timestamped safety copy;
5. copy/migrate into the new data directory;
6. verify SHA-256 where useful;
7. reopen the migrated DB;
8. run migrations;
9. run reconciliation/invariant checks;
10. only after all checks pass, mark migration complete;
11. preserve the original file as rollback material.

If any verification fails, stop and show an actionable Persian error. Do not create a blank database over the old one.

## Absolutely forbidden

- automatic destructive seeding on production startup;
- DROP TABLE during normal production startup;
- resetting data because the schema is old;
- deleting SQLite WAL/SHM files blindly while the DB is open;
- overwriting the active DB during restore without a verified pre-restore backup;
- silently ignoring migration errors;
- "fixing" historical accounting balances by deleting/recreating data;
- using test fixtures against the live user database.

Treat any existing destructive behavior in `db/seed.js` as development-only. Add a hard production guard if necessary.

---

# 4. Preserve domain invariants

Read and enforce:

- `docs/DOMAIN_INVARIANTS.md`
- `docs/ACCOUNTING_FLOWS.md`
- `docs/INVENTORY_FLOWS.md`
- `docs/CRM_FLOWS.md`
- `docs/PURCHASING_FLOWS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/FULL_SYSTEM_AUDIT_2026.md`

At minimum, the packaged desktop build must preserve:

## Accounting

- strict double-entry;
- every posted journal entry remains balanced;
- posted vouchers remain immutable;
- correction through reversal/replacement rather than destructive editing;
- trial balance remains balanced;
- GL reports continue to work.

## Inventory

- quantity never negative;
- reserved quantity never negative;
- reserved quantity never exceeds quantity;
- FEFO allocation remains correct;
- layaway stock remains isolated;
- COGS remains derived from actual allocated batches.

## POS

- split payments remain mapped correctly;
- anti-double-return remains active;
- returns and exchanges remain atomic;
- payment status remains correct.

## CRM / wallet / loyalty

- wallet cannot become negative;
- wallet transaction history remains reconcilable;
- loyalty points remain reconstructible;
- return flows correctly reverse earned benefits.

## Procurement

- purchase receipt;
- supplier AP;
- supplier payment;
- purchase return;
- inventory/GL postings;
- aging reports

must remain consistent.

Do not change domain behavior merely to make packaging easier.

---

# 5. Native SQLite dependency compatibility

The current project uses `better-sqlite3`.

The currently installed/newest package version must NOT simply be assumed to work on Windows 7 x86 or Electron ia32.

Perform a compatibility investigation before locking the final runtime:

1. identify the current `better-sqlite3` API surface used by this repository;
2. identify an x86-compatible version/build strategy for the selected runtime;
3. verify:
   - database open
   - prepared statements
   - transactions
   - WAL
   - custom function registration (`NORM_FA`)
   - online backup API
   - `integrity_check`
   - `foreign_key_check`
   - migration runner
4. rebuild the native module for the exact Electron/Node ABI if needed;
5. test the resulting `.node` binary on actual Windows 7 SP1 32-bit.

Prefer the least invasive compatibility solution.

Do not replace `better-sqlite3` with another driver unless required, because the application currently relies heavily on synchronous prepared statements and transactions.

If replacement is unavoidable, create a compatibility layer and prove through tests that transaction semantics and all service behavior are unchanged.

---

# 6. Desktop application behavior

The user experience should be:

1. Install `KayhanBeautyERP-Setup-x86.exe`.
2. Launch from Desktop or Start Menu.
3. The application starts automatically.
4. No terminal window is required.
5. The local backend starts internally.
6. The main Persian ERP UI opens.
7. Closing the application safely shuts down the backend and database.
8. User data remains available after reboot, upgrade, reinstall, or application replacement.

If an embedded local HTTP server is retained:

- bind only to `127.0.0.1`, not all network interfaces;
- avoid unnecessary firewall prompts;
- do not expose the ERP to the LAN;
- restrict CORS/same-origin behavior appropriately;
- choose a safe port strategy;
- detect port collision and fail gracefully;
- ensure only one application instance controls the active database.

Implement single-instance locking.

The renderer must not be allowed to navigate to arbitrary external URLs.

Disable unnecessary Electron privileges.

Do not load remote web content into privileged renderer contexts.

---

# 7. Graceful shutdown and crash recovery

The existing database layer uses WAL and graceful checkpoint logic. Preserve and strengthen it.

Required:

- normal window close triggers backend shutdown;
- app quit triggers SQLite checkpoint and close;
- Windows logoff/shutdown is handled as safely as possible;
- forced process termination must recover through SQLite WAL on restart;
- stale lock assumptions must not corrupt startup;
- failed startup must never cause a database reset.

On every startup, perform lightweight safety checks.

On suspicious shutdown or recovery state, run stronger checks before allowing writes.

Do not run expensive full checks on every UI action.

---

# 8. Backup and restore

Preserve and integrate existing:

- `scripts/backup.js`
- `scripts/restore.js`

The final desktop app must support safe user-accessible backup and restore.

Required behavior:

- backup database using SQLite-safe online backup behavior;
- retain manifest/checksum metadata;
- maintain retention policy;
- never store the only backup next to the executable;
- create pre-restore safety backup;
- verify source backup integrity before restore;
- atomic/staged restore;
- post-restore integrity and FK verification;
- append restore result to audit/manifest;
- present clear Persian success/failure messages.

Add automatic backups at appropriate events:

- before schema migration;
- before application upgrade migration;
- before restore;
- optional daily/startup backup subject to retention.

Do not create excessive duplicate backups on every click.

Test restoring an old valid backup into a newer application version and verify migrations afterward.

---

# 9. Upgrade behavior

The installer must support upgrading from an older desktop release without losing the database.

Requirements:

- application binaries may be replaced;
- user data directory must remain untouched;
- prior database must be backed up before schema migration;
- migrations must be forward-only and versioned;
- migration failure must preserve a rollback path;
- do not run seed on upgrade;
- do not silently create a second empty database.

Uninstall behavior:

- by default, uninstall application binaries only;
- preserve user data and backups;
- if a "delete all business data" option is ever added, it must be a separate explicit destructive action with strong confirmation, not the default uninstaller behavior.

---

# 10. Existing automated tests are mandatory gates

Do not rewrite tests merely to make them green.

Run the repository's existing tests before changes and record the baseline.

After each major migration phase, rerun them.

At minimum:

`npm test`

and all available tiers/stress suites must be executed.

Review:

- `tests/runner.js`
- `tests/tier1/`
- `tests/tier2/`
- `tests/tier3/`
- `tests/tier4/`
- `tests/stress/`
- `tests/stress_m1_challenger.js`

Also run:

`scripts/simulate90Days.js`

against disposable test databases, never against the production/user database.

A package build is not acceptable if tests pass only in the modern development environment but fail in the packaged x86 application.

---

# 11. Add desktop-specific test coverage

Create automated/integration tests for:

## Install / launch

- clean Windows 7 SP1 x86 install;
- first launch;
- second launch;
- single-instance behavior;
- reboot and relaunch;
- no developer runtime present;
- no internet connection.

## Data persistence

Create records across modules, close app, restart machine/app, and confirm exact persistence for:

- products
- batches
- customers
- suppliers
- sales
- payments
- expenses
- journals
- wallet transactions
- loyalty
- settings
- users/permissions

## Upgrade

- install version A;
- create realistic data;
- install version B over A;
- confirm the same DB is used;
- confirm zero data loss;
- confirm migrations apply once only;
- verify no duplicate seed/default rows.

## Uninstall / reinstall

- create data;
- uninstall application;
- verify user data remains;
- reinstall;
- verify application reconnects to the same data.

## Backup / restore

- create business transactions;
- backup;
- add more transactions;
- restore;
- verify database returns exactly to backup state;
- verify restore does not produce corruption;
- verify pre-restore safety backup exists.

## Crash / power-loss simulation

Using a disposable DB:

- terminate app during normal idle;
- terminate after write;
- terminate around transaction boundary;
- restart;
- verify SQLite integrity;
- verify domain invariants;
- verify no half-applied accounting event.

## Path and locale

Test installation and use under Windows accounts such as:

- `C:\\Users\\علی\\...`
- username containing Persian characters;
- paths containing spaces.

Verify Persian UI, CSV export BOM/encoding, Jalali dates, printing/export if present.

---

# 12. 90-day operational simulation

Use the existing 90-day simulator as the basis for a much stronger release test.

Run a disposable 90-day store scenario containing realistic combinations of:

- daily POS sales;
- cash/card/split tenders;
- returns;
- exchanges;
- inventory depletion;
- FEFO allocations;
- layaway/reservations where supported;
- purchases;
- supplier settlements;
- purchase returns;
- operating expenses;
- wallet deposits/spends;
- loyalty earn/redeem/reversal;
- new customers;
- campaigns/CRM actions where relevant;
- backup cycles;
- application restarts;
- month boundaries;
- Persian/Jalali date usage.

At the end of every simulated day or a reasonable periodic checkpoint, validate reconciliation.

At final day validate:

- SQLite integrity = ok;
- no FK violations;
- journal debit == credit;
- no negative stock;
- reserved <= quantity;
- no negative wallet;
- order/payment consistency;
- loyalty consistency;
- supplier/AP consistency;
- inventory reconciliation;
- all required reports open without error.

Save machine-readable evidence under a release-test/evidence folder.

---

# 13. Real Windows 7 SP1 32-bit acceptance environment

This is a hard release gate.

The final artifact must be tested in an actual Windows 7 SP1 32-bit environment.

Preferred:

- clean Windows 7 SP1 32-bit VM snapshot;
- 2 GB RAM profile;
- 4 GB RAM profile if available;
- no Node/npm/Git installed;
- offline network state for normal-operation tests.

Do not claim Windows 7 x86 compatibility solely from:

- Windows 10/11 x64;
- WOW64;
- `--arch=ia32` build output existing;
- CI on a 64-bit Windows runner;
- compatibility mode;
- Wine.

Those can be secondary tests only.

If your current environment cannot run a true Windows 7 SP1 x86 VM, clearly mark the release gate as **BLOCKED**, produce the x86 artifact, and do not fabricate a PASS.

Record:

- OS version
- architecture
- RAM
- artifact SHA-256
- install result
- startup time
- memory usage
- test suites executed
- screenshots/logs where useful
- failures and fixes

---

# 14. Performance and reliability on old hardware

Windows 7 32-bit machines have limited address space.

Avoid unnecessary Electron windows/processes and background jobs.

Requirements:

- one primary app window;
- avoid excessive Chromium processes where configurable and safe;
- no runaway timers;
- no large in-memory duplication of DB data;
- pagination for large tables where needed;
- no loading all historical records into the DOM unnecessarily;
- reports must remain responsive on realistic multi-year data.

Test with a significantly enlarged disposable database.

Report actual idle and active memory usage on Windows 7 x86 rather than inventing estimates.

Any out-of-memory crash is release-blocking.

---

# 15. Production logging and diagnostics

Add local logs suitable for support without exposing secrets.

Recommended:

`%LOCALAPPDATA%\\KayhanBeautyERP\\logs\\`

Include:

- app start/stop;
- runtime version;
- DB path;
- schema version;
- migration start/result;
- backup/restore result;
- fatal errors;
- integrity-check result;
- crash recovery state.

Do not log:

- passwords;
- sensitive full customer records unnecessarily;
- authentication secrets.

Implement bounded log rotation so logs do not fill disk forever.

Add a "System Information / Diagnostics" view or export that can package non-sensitive logs and version information for support.

---

# 16. Security constraints for an unsupported legacy OS

Windows 7 is an end-of-life operating system. The application must minimize attack surface.

Because the target must remain Windows 7 compatible:

- assume the embedded browser/runtime itself is legacy;
- operate offline/local by default;
- bind backend to localhost only;
- do not expose remote debugging;
- disable devtools in production unless an explicit support switch is used;
- disable arbitrary navigation;
- avoid loading remote JavaScript/CSS;
- ship local static assets;
- avoid automatic internet-based updater;
- do not add telemetry that requires internet;
- use least-privilege file access;
- do not require administrator privileges for normal application execution.

Do not introduce internet dependence to compensate for old runtime limitations.

---

# 17. Build and release artifacts

Create reproducible scripts such as:

- `npm run desktop:dev`
- `npm run desktop:test`
- `npm run desktop:build:x86`
- `npm run desktop:package:x86`

Final release folder must include at minimum:

1. `KayhanBeautyERP-Setup-x86.exe`
2. portable x86 package
3. SHA-256 checksums
4. release notes
5. Windows 7 x86 compatibility report
6. test report
7. migration/backup instructions
8. rollback instructions

The end user must not need npm.

---

# 18. Required documentation

Add/update documentation covering:

- desktop architecture;
- why the selected runtime supports Windows 7 x86;
- exact pinned versions;
- build steps;
- developer prerequisites;
- release process;
- persistent data locations;
- backup/restore;
- legacy DB migration;
- upgrade procedure;
- uninstall behavior;
- troubleshooting;
- recovery from failed migration;
- recovery from corrupted DB;
- Windows 7 VM test procedure.

Include a concise Persian operator guide.

---

# 19. Implementation workflow

Work in phases.

## Phase A — baseline freeze

Before changing code:

1. inspect the whole repository;
2. run all current tests;
3. inspect current DB path assumptions;
4. list all native dependencies;
5. create a compatibility matrix;
6. record current schema version and test results;
7. create a backup of any local working DB used for analysis.

Do not modify live production data.

## Phase B — compatibility spike

Prove:

- Windows 7 SP1 x86 shell launches;
- selected SQLite binding works;
- native module loads;
- read/write transaction succeeds;
- WAL works;
- backup works;
- packaged app launches.

Do this before large refactoring.

## Phase C — persistent path migration

Introduce central path abstraction and safe legacy DB migration.

Run tests.

## Phase D — desktop shell

Add lifecycle management, single-instance behavior, localhost binding, safe quit, Persian UI launch.

Run tests.

## Phase E — installer and portable packaging

Produce x86 artifacts.

Run package-level tests.

## Phase F — reliability hardening

Backup, restore, crash recovery, logs, upgrade/uninstall persistence.

Run tests.

## Phase G — Windows 7 x86 validation

Execute full acceptance matrix on actual Windows 7 SP1 32-bit.

## Phase H — release

Only after all gates pass, produce final artifacts and report.

---

# 20. Definition of Done

You may only declare this task DONE when all of the following are true:

- a win32/ia32 installer exists;
- a win32/ia32 portable build exists;
- app launches on real Windows 7 SP1 32-bit;
- no Node/npm/Git is installed on the target machine;
- application runs offline;
- all existing business modules are present;
- existing automated tests pass;
- desktop/package tests pass;
- 90-day simulation passes;
- DB integrity passes;
- FK integrity passes;
- accounting remains balanced;
- inventory invariants pass;
- wallet/loyalty invariants pass;
- procurement reconciliation passes;
- backup/restore works;
- crash recovery works;
- upgrade preserves data;
- uninstall/reinstall preserves data;
- Persian username/path works;
- logs and diagnostics work;
- no production seed/reset behavior exists;
- exact build versions are pinned;
- SHA-256 checksums are published;
- release evidence is committed.

If any item cannot be validated, state exactly which item is blocked and why. Do not lower the acceptance criteria silently.

---

# 21. Change-control rules

- Preserve current user-visible behavior unless a change is necessary for Windows 7 x86 compatibility or data safety.
- Do not refactor unrelated business logic.
- Do not alter financial history to make tests pass.
- Do not delete old migrations.
- Never edit an already-applied migration; add a new migration.
- Keep commits small and reviewable.
- After every important change, rerun relevant tests.
- Record all compatibility compromises in release documentation.
- Prefer rollback-capable changes.
- Never claim a test was executed if it was not actually executed.

---

# 22. Required final report

At completion, output a concise final report with these sections:

1. Architecture chosen
2. Exact runtime/package versions
3. Files changed
4. Database migration strategy
5. Data directory
6. Backup strategy
7. Installer/portable artifact paths
8. Windows 7 SP1 32-bit test machine details
9. Test results
10. 90-day simulation results
11. Accounting/inventory/CRM/procurement reconciliation results
12. Upgrade/uninstall persistence results
13. Known limitations
14. SHA-256 hashes
15. Rollback procedure

Do not use vague phrases like "should work on 32-bit".

Provide concrete evidence.

---

# Final priority order

When trade-offs appear, optimize in this order:

1. NO DATA LOSS
2. ACCOUNTING AND INVENTORY CORRECTNESS
3. WINDOWS 7 SP1 32-BIT COMPATIBILITY
4. OFFLINE RELIABILITY
5. FULL MODULE PRESERVATION
6. BACKUP/RECOVERY
7. PERFORMANCE
8. UI POLISH

The result must behave like the same ERP, with the same business memory and modules, delivered as a reliable Windows 7 SP1 32-bit desktop product.
