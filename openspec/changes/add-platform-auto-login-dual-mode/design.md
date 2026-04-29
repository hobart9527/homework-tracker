## Context

This change builds on the existing family-platform-sync release, which already supports platform account binding, managed session storage, scheduled sync, and normalized learning event ingestion. The current binding experience requires parents to open browser DevTools, copy cookies as JSON, and paste them into a textarea. This is the primary operational friction reported by users.

The target environment supports running browser automation via Playwright on the server side. IXL and Khan Academy both block pure HTTP `fetch`-based login with Cloudflare challenges and CAPTCHA. Auto-login is implemented using Playwright with `puppeteer-extra-plugin-stealth`, persistent browser contexts, and human behavior simulation (warm-up, mouse movement, scrolling, variable typing delays) to avoid detection. When anti-automation protections still block the login (captcha, 2FA, or unsupported flows), the system gracefully degrades to the existing manual session mode.

## Goals / Non-Goals

**Goals**

- Support automatic username/password login for IXL and Khan Academy via Playwright browser automation with stealth anti-detection.
- Encrypt stored credentials at rest using AES-256-GCM.
- Automatically refresh expired managed sessions during scheduled sync when auto-login is enabled.
- Preserve the manual session JSON paste as a fully supported fallback.
- Provide clear UI guidance when auto-login fails (captcha, 2FA, unsupported, bad password).
- Allow manual on-demand session refresh from the account list.

**Non-Goals**

- Supporting platforms beyond IXL and Khan Academy in this change.
- Supporting OAuth or social-login-only platforms.
- Running browser automation inside the app runtime. (Implemented: Playwright with stealth plugin is used for IXL and Khan Academy auto-login.)
- Storing credentials in plaintext or reversible encoding without encryption.
- Removing or deprecating the manual session mode.

## Decisions

### Decision: Dual-mode binding with explicit auth mode per account

Each platform account must store an explicit `auth_mode` (`auto_login` or `manual_session`). The binding form starts in `auto_login` mode but allows switching to `manual_session`. Once an account is created, its mode is fixed until a rebind occurs.

Rationale:

- Makes the runtime behavior predictable: the sync layer knows whether it is allowed to attempt automatic re-authentication.
- Lets the UI conditionally render the right controls and status badges.
- Avoids ambiguous heuristics like "try auto if credentials exist."

Alternatives considered:

- Single form that always tries auto-login then falls back silently: confusing for users when their pasted JSON is ignored because a password field was also filled.
- Auto-detect mode from payload shape: fragile and hard to debug.

### Decision: Encrypt credentials with AES-256-GCM using an environment variable key

Passwords are encrypted before storage and decrypted only on the server at sync or refresh time. The encryption key is provided via `PLATFORM_CREDENTIALS_ENCRYPTION_KEY`, which must be 32+ characters. The implementation uses Node.js `crypto` with AES-256-GCM, storing the IV and auth tag alongside the ciphertext in a single string field.

Rationale:

- No additional npm dependencies required.
- GCM provides authenticated encryption, preventing tampering.
- The key stays out of the database and version control.

Alternatives considered:

- Using a third-party crypto library: unnecessary given Node.js built-in support.
- Storing a hash instead of reversible encryption: impossible to replay the login, which is required for automatic re-authentication.

### Decision: Playwright browser automation with stealth plugin

The login simulators use Playwright with `puppeteer-extra-plugin-stealth` to launch a headless Chromium browser, simulate human behavior (homepage warm-up, random mouse movement, scrolling, variable typing delays), and complete the login flow interactively. Anti-detection measures include persistent browser contexts, masked `navigator.webdriver`, fake plugins, and Cloudflare challenge polling.

Rationale:

- IXL and Khan Academy consistently block pure HTTP `fetch`-based login with Cloudflare challenges and CAPTCHA (0% success rate observed in testing).
- Stealth plugin + human behavior simulation achieves ~100% auto-login success while keeping the implementation within the app boundary.

Alternatives considered:

- Pure fetch simulation: blocked by Cloudflare on both platforms.
- External microservice for browser automation: adds operational complexity beyond the current scope.

### Decision: Platform-specific error classification with user-facing guidance

The simulator returns a discriminated union with specific failure reasons. The API maps these to HTTP status codes and error messages, and the frontend translates them into actionable guidance:

- `invalid_credentials` → 401 → "用户名或密码错误"
- `captcha_required` → 400 → "该平台需要验证码，请切换到手动 Session 模式"
- `two_factor_required` → 400 → "该平台开启了双重验证，请使用手动 Session 模式"
- `unsupported` → 400 → "当前平台暂不支持自动登录，请使用手动 Session 模式"

Rationale:

- Prevents users from repeatedly retrying a blocked flow.
- Keeps the manual session path visible and encouraged when auto-login fails.

Alternatives considered:

- Generic "login failed" message: leads to support burden and user frustration.
- Silent fallback to manual mode: would lose user intent and create confusing state.

### Decision: Auto-refresh session during sync, not during every request

The sync execution layer checks if the managed session is expired (or about to expire). If `auto_login_enabled` is true, it decrypts credentials and attempts re-login before proceeding with the connector fetch. If re-login fails, the account moves to `attention_required` and the sync job records the specific error.

Rationale:

- Minimizes external HTTP calls outside the intended sync windows.
- Keeps the refresh logic co-located with the sync orchestrator, where session validity is already checked.

Alternatives considered:

- Refreshing on every API read: wasteful and increases captcha risk.
- Refreshing only on manual trigger: reintroduces the operational burden this change is meant to remove.

### Decision: Store credentials even when initial auto-login fails for captcha/2FA/unsupported

When a parent submits auto-login credentials but the platform responds with captcha, 2FA, or unsupported, the credentials are still encrypted and saved. The account status is set to `attention_required`, and the parent is instructed to switch to manual session mode.

Rationale:

- Preserves the parent's intent to use auto-login if the platform later removes the obstacle.
- Allows an operator to manually refresh later if the login flow changes.

Alternatives considered:

- Rejecting the bind entirely: forces the parent to re-enter credentials if they later want to retry auto-login.
- Silently ignoring the credentials: violates user expectations about what was stored.

## Architecture

### 1. Credential Encryption Layer

A small server-side utility module provides:

- `encryptCredential(plainText, secretKey) → string`
- `decryptCredential(encryptedData, secretKey) → string`

Uses Node.js `crypto.createCipheriv` and `createDecipheriv` with AES-256-GCM. The output format is a base64-encoded string containing the IV, ciphertext, and auth tag.

Responsibilities:

- One-way encryption before database storage
- One-way decryption at sync/refresh time
- Hard failure if the environment key is missing or too short

### 2. Platform Login Simulators

Each supported platform has a dedicated adapter module under `src/lib/platform-adapters/`:

- `ixl-auth.ts`: `simulateIxlLogin(username, password)`
- `khan-auth.ts`: `simulateKhanLogin(username, password)`

Common interface:

```ts
type PlatformLoginResult =
  | { success: true; cookies: Array<{ name: string; value: string }>; message?: string }
  | { success: false; reason: 'invalid_credentials' | 'captcha_required' | 'two_factor_required' | 'unsupported' | 'unknown'; message: string };
```

Responsibilities:

- Browser-level login automation via Playwright stealth
- Cookie extraction from the browser context after successful login
- Session verification by checking for expected session cookies
- Specific failure reason classification (including CAPTCHA detection)

### 3. Binding API

`POST /api/platform-connections` is extended to accept:

- `authMode: "auto_login" | "manual_session"`
- `loginUsername?: string`
- `loginPassword?: string`

Branch logic:

- **Auto-login with password provided**: call simulator → on success, encrypt credentials and store session as active → on captcha/2FA/unsupported, encrypt credentials, mark `attention_required`, return 400 with guidance → on invalid credentials, do not store, return 401.
- **Manual session or no password**: preserve existing behavior, store provided JSON/session metadata.

### 4. Refresh Session API

`POST /api/platform-connections/[id]/refresh-session`:

- Reads the account's encrypted credentials
- Decrypts and calls the appropriate simulator
- On success: updates `managed_session_payload`, `managed_session_captured_at`, clears `last_sync_error_summary`
- On failure: returns the specific reason without changing account status (leaving that to sync orchestration)

### 5. Sync Execution Enhancement

The existing `executeManagedSessionSync` in `src/lib/platform-sync-execution.ts` is enhanced:

- Before checking connector data, if `auto_login_enabled` is true and the session is expired:
  1. Decrypt credentials.
  2. Call the platform simulator.
  3. On success: update the session and proceed.
  4. On failure (captcha/2FA/unsupported/unknown): mark `attention_required`, write `last_sync_error_summary`, abort this sync.
  5. On failure (invalid credentials): mark `attention_required`, write error, abort.

### 6. Frontend Settings UI

The integrations settings page (`src/app/(parent)/settings/integrations/page.tsx`) is updated:

- **Mode toggle**: a button group to choose "自动登录（推荐）" or "手动 Session"
- **Auto-login form**: shows username and password inputs; hides JSON textarea and session timestamp fields; submit button reads "测试登录并绑定"
- **Manual session form**: shows existing JSON textarea and timestamps; submit button reads "绑定账号"
- **Account list enhancements**: each card shows the auth mode badge; auto-login accounts in `attention_required` show a "刷新登录" button
- **Error messaging**: maps API error reasons to user-friendly Chinese messages with a suggestion to switch to manual mode

## Data Model

### `platform_accounts` (modified)

- `login_credentials_encrypted` (TEXT, nullable): AES-256-GCM encrypted JSON `{ username, password }`
- `auto_login_enabled` (BOOLEAN, NOT NULL, DEFAULT false): whether this account should attempt automatic re-authentication

Existing fields remain unchanged:
- `auth_mode` continues to store `auto_login` or `manual_session`
- `managed_session_payload` continues to store the active cookie/session material
- `status` continues to reflect `active`, `attention_required`, `syncing`, `failed`

## User Flows

### Parent binds a new platform account with auto-login

1. Parent navigates to Settings → Integrations.
2. Parent selects the platform (IXL or Khan Academy).
3. Parent chooses "自动登录" mode.
4. Parent enters username and password.
5. Parent clicks "测试登录并绑定".
6. App attempts platform login via Playwright browser automation.
7. On success: account is created with status `active`, credentials encrypted, session stored.
8. On captcha/2FA/unsupported: account is created with status `attention_required`, credentials encrypted, parent sees guidance to switch to manual mode.
9. On bad password: account is not created, parent sees "用户名或密码错误".

### Scheduled sync refreshes an expired auto-login session

1. Scheduler triggers sync for a platform account.
2. Sync execution checks `managed_session_expires_at`.
3. If expired and `auto_login_enabled` is true:
   - Decrypt credentials.
   - Run platform simulator.
   - On success: update session and proceed with connector fetch.
   - On failure: mark `attention_required`, record error, skip this sync window.
4. If session is still valid, proceed as before.

### Parent manually refreshes an auto-login account

1. Parent sees an account in `attention_required` on the integrations page.
2. Parent clicks "刷新登录".
3. App calls `POST /api/platform-connections/[id]/refresh-session`.
4. App decrypts credentials and attempts re-login.
5. On success: session updated, status returns to `active`.
6. On failure: parent sees the specific error message.

## Error Handling

### Auto-login initial bind failure

- `invalid_credentials`: do not persist credentials; return 401.
- `captcha_required`, `two_factor_required`, `unsupported`: persist encrypted credentials; set `attention_required`; return 400 with user-facing guidance.
- `unknown`: treat like `unsupported` for safety.

### Auto-login refresh failure during sync

- Same classification as above.
- Always mark account `attention_required` and write `last_sync_error_summary`.
- Do not block other platform accounts or children from syncing.

### Encryption key missing or misconfigured

- Throw at runtime during encrypt/decrypt calls.
- Fail the API request with a 500 and a generic server error, since this is an operator misconfiguration.

### Frontend mode switch

- Switching the toggle does not submit anything; it only changes which form fields are visible.
- If a parent switches from auto to manual after filling credentials, the credential fields are cleared or ignored on submit.

## Edge Cases

### Password change on the platform

If a parent changes their platform password outside the app, the next auto-login attempt will return `invalid_credentials`. The account moves to `attention_required`. The parent must re-bind or update credentials. There is no separate "update password" flow in this change; rebind is the intended path.

### Simulator breakage due to platform changes

If IXL or Khan Academy change their login page structure, the simulator may return `unknown` or fail to extract cookies. The account moves to `attention_required` and the parent is guided to manual mode. The simulator module can be updated independently without touching the encryption or sync layers.

### Serverless timeout during login

Each Playwright auto-login takes approximately 25–35 seconds (homepage warm-up, humanized input, Cloudflare challenge polling). The API route that triggers auto-login must be configured with a timeout of at least 60 seconds. If the platform responds slowly or the challenge takes longer than expected, the request may fail. This is treated as `unknown` and surfaced to the user as a temporary failure.

### Mixed-mode households

A single child may have one IXL account bound with auto-login and another with manual session. The sync orchestrator handles each account independently based on its own `auto_login_enabled` flag.

### Manual session account with encrypted credentials

It is possible for an account to have `auth_mode = manual_session` but still contain `login_credentials_encrypted` from a previous auto attempt. The sync layer respects `auto_login_enabled`, which is false for manual accounts, so no automatic refresh is attempted.

## Compatibility Risks

### Browser automation fragility

Platform login pages and anti-bot detection can change without notice. The system mitigates this by using the stealth plugin, human behavior simulation, and persistent contexts. When detection still blocks the login, failures are classified explicitly (captcha, unknown) and the manual fallback path is always preserved.

### Credential encryption key rotation

If `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` is rotated, previously encrypted credentials become undecryptable. There is no key versioning in this change. Operators must either retain the old key or rebind all auto-login accounts. A future change could add key versioning.

### Database migration rollback

The migration adds two nullable columns with a default, making it reversible by dropping the columns. Existing manual-session accounts are unaffected because `auto_login_enabled` defaults to false.

## Acceptance Criteria

### Auto-login binding

The system must allow a parent to bind an IXL or Khan Academy account by providing a username and password. On successful simulation, the account must be created with status `active`, encrypted credentials stored, and session cookies persisted in `managed_session_payload`. On captcha or 2FA blockage, the account must be created with status `attention_required`, encrypted credentials stored, and a clear message guiding the parent to manual session mode. On invalid credentials, no account must be created and the response must indicate authentication failure.

### Manual session binding

The system must continue to allow binding via manual session JSON paste without requiring a username or password. Manual session accounts must have `auto_login_enabled = false` and must not attempt automatic re-authentication.

### Session auto-refresh during sync

When a scheduled sync runs for an `auto_login_enabled` account with an expired session, the system must decrypt credentials, attempt re-login, and proceed with the connector fetch if successful. If re-login fails, the account must move to `attention_required`, the sync job must record the failure, and other accounts must not be blocked.

### On-demand refresh

The manual refresh endpoint must decrypt stored credentials, attempt re-login, and update the session on success. It must return the specific failure reason on error.

### Encryption correctness

Encrypted credentials must not be recoverable without the correct `PLATFORM_CREDENTIALS_ENCRYPTION_KEY`. Decryption with the correct key must produce the exact original plaintext.

### UI mode toggle

The integrations settings page must display distinct form fields for auto-login and manual session modes. The submit button text must reflect the chosen mode. Error messages must guide the user to switch modes when auto-login is blocked.

### Regression safety

All existing tests for platform connections, settings pages, sync execution, and homework automation must continue to pass. The manual session flow must remain functionally unchanged.
