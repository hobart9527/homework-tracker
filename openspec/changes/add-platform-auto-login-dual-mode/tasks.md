## Execution

## 1. Database Migration

- [x] 1.1 Create migration `023_add_platform_login_credentials.sql`
- [x] 1.2 Add `login_credentials_encrypted TEXT` column to `platform_accounts`
- [x] 1.3 Add `auto_login_enabled BOOLEAN NOT NULL DEFAULT false` column to `platform_accounts`
- [x] 1.4 Verify migration applies cleanly and is reversible

## 2. Credential Encryption Module

- [x] 2.1 Create `src/lib/crypto.ts` with AES-256-GCM encrypt/decrypt functions
- [x] 2.2 Read `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` from environment
- [x] 2.3 Validate key length (32+ chars) before use
- [x] 2.4 Encode output as base64 string containing IV + ciphertext + auth tag
- [x] 2.5 Add unit tests verifying round-trip correctness and tamper detection

## 3. Platform Login Simulators

- [x] 3.1 Create `src/lib/platform-adapters/ixl-auth.ts` with `simulateIxlLogin`
- [x] 3.2 Create `src/lib/platform-adapters/khan-auth.ts` with `simulateKhanLogin`
- [x] 3.3 Define shared `PlatformLoginResult` discriminated union type
- [x] 3.4 Implement HTTP fetch flow: GET login page → POST credentials → extract cookies → verify session
- [x] 3.5 Classify responses into `invalid_credentials`, `captcha_required`, `two_factor_required`, `unsupported`, `unknown`
- [x] 3.6 Set 15-second timeout on external HTTP requests

## 4. Binding API Enhancement

- [x] 4.1 Extend `POST /api/platform-connections` request body to accept `authMode`, `loginUsername`, `loginPassword`
- [x] 4.2 Implement auto-login branch: simulate login → encrypt credentials → store session → return account
- [x] 4.3 Handle `invalid_credentials`: reject without storing
- [x] 4.4 Handle `captcha_required` / `two_factor_required` / `unsupported`: store encrypted credentials, mark `attention_required`, return 400 with guidance
- [x] 4.5 Preserve manual session branch exactly as before
- [x] 4.6 Update unit tests to cover new branches and assert correct `auth_mode` values

## 5. Refresh Session API

- [x] 5.1 Create `POST /api/platform-connections/[id]/refresh-session/route.ts`
- [x] 5.2 Read account from database and verify parent ownership
- [x] 5.3 Decrypt `login_credentials_encrypted`
- [x] 5.4 Call appropriate platform simulator
- [x] 5.5 On success: update `managed_session_payload` and `managed_session_captured_at`
- [x] 5.6 On failure: return specific reason without mutating account status

## 6. Sync Execution Auto-Refresh

- [x] 6.1 Add `tryAutoLoginRefresh` helper in `src/lib/platform-sync-execution.ts`
- [x] 6.2 Hook into `executeManagedSessionSync` before session expiry check
- [x] 6.3 On successful refresh: update session and continue sync
- [x] 6.4 On failure: mark `attention_required`, write `last_sync_error_summary`, abort sync
- [x] 6.5 Ensure failure does not block other accounts or children

## 7. Frontend UI Dual Mode

- [x] 7.1 Add mode toggle button group (自动登录 / 手动 Session) to binding form
- [x] 7.2 Auto-login mode: show username and password inputs, hide JSON textarea and timestamps
- [x] 7.3 Manual session mode: preserve existing JSON textarea and timestamp inputs
- [x] 7.4 Change submit button text based on mode ("测试登录并绑定" vs "绑定账号")
- [x] 7.5 Add auth mode badge to each account card in the list
- [x] 7.6 Add "刷新登录" button for `attention_required` auto-login accounts
- [x] 7.7 Map API error reasons to user-friendly Chinese messages with manual-mode guidance

## 8. Types and Configuration

- [x] 8.1 Update `src/lib/supabase/types.ts` to include new `platform_accounts` columns
- [x] 8.2 Add `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` to `.env.example` with documentation
- [x] 8.3 Fix pre-existing TypeScript error in `HomeworkForm.tsx` unrelated to this change

## 9. Verification

- [x] 9.1 All 299 unit tests across 52 files pass
- [x] 9.2 `platform-connections.test.ts` covers unauthenticated rejection, manual session success, auto-login with managed session success for IXL, auto-login with managed session success for Khan, unsupported platform rejection, and cross-parent binding blocking
- [x] 9.3 `settings-page.test.ts` covers mode toggle rendering, bridge health check, manual session form submission from integrations page, child routing focused on WeChat bridge targets, and system page runtime status with retry actions
- [x] 9.4 Build completes without TypeScript or lint errors

## Remaining Clarifications

None. Implementation is complete and verified.
