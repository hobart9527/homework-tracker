## Why

The current platform account binding in the family-platform-sync release requires parents to manually extract cookies from browser DevTools and paste a JSON blob into a "Managed Session" text area. This is technically demanding, error-prone, and must be repeated every time a session expires.

This change is needed to lower the barrier for parents by supporting automatic username/password login simulation that extracts and stores session cookies automatically, while preserving the existing manual session paste as a fallback when auto-login is blocked by captcha, two-factor authentication, or unsupported login flows.

## What Changes

- Add a dual-mode authentication flow for platform account binding: `auto_login` and `manual_session`.
- Add server-side AES-256-GCM encryption for stored login credentials.
- Add Playwright browser automation with stealth plugin for IXL and Khan Academy auto-login, extracting session cookies after simulating human behavior.
- Add automatic session refresh during scheduled sync when `auto_login_enabled` is true and the managed session has expired.
- Add a manual session refresh endpoint for operators or parents to re-authenticate an auto-login account on demand.
- Update the settings integrations UI with a mode toggle, conditional form fields, and error guidance when auto-login fails.

## Capabilities

### New Capabilities

- `platform-auto-login`: Automatically log in to supported platforms using stored username/password, extract session cookies, and persist them as managed sessions.
- `platform-session-auto-refresh`: During scheduled sync, automatically re-login and refresh the managed session before marking it expired.
- `platform-credential-encryption`: Encrypt platform login passwords at rest using AES-256-GCM with an environment-variable secret key.
- `platform-login-failure-guidance`: Return specific failure reasons (`invalid_credentials`, `captcha_required`, `two_factor_required`, `unsupported`, `unknown`) so the UI can guide users to manual session mode when auto-login is blocked.

### Modified Capabilities

- `platform-account-binding`: Extended to support both auto-login and manual session modes, with mode stored per account.
- `managed-session-sync`: Enhanced to attempt automatic re-authentication before treating a session as expired.
- `parent-settings-integrations`: UI now shows a mode toggle, conditionally renders credential fields or JSON textarea, and displays auth-mode badges in the account list.

## Impact

- New database columns on `platform_accounts` for encrypted credentials and auto-login flag.
- New encryption utility module using Node.js built-in `crypto`.
- New platform adapter modules for IXL and Khan Academy Playwright stealth login automation.
- Modified platform-connections API to accept auth mode, username, and password.
- New refresh-session API route for on-demand re-authentication.
- Modified sync execution layer to attempt transparent session refresh.
- Modified frontend settings page with dual-mode form UI and error messaging.
- New required environment variable `PLATFORM_CREDENTIALS_ENCRYPTION_KEY`.
