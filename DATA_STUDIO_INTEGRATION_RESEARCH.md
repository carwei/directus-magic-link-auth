# Data Studio Integration Research

## Overview
This document captures extensive research into making magic link authentication work with Directus Data Studio (the admin interface). While the magic link extension works perfectly for custom frontends, Data Studio integration faces significant technical challenges.

## The Core Problem

### Why It Doesn't Work Out of the Box
1. **Session Context Mismatch**: When our endpoint makes server-to-server calls to verify magic links, it creates sessions in the server's context, not the browser's context
2. **Cookie Types**: Data Studio uses `directus_session_token` (session mode) while our API creates `directus_refresh_token` (cookie mode)
3. **Content Security Policy (CSP)**: Directus has strict CSP that blocks inline JavaScript and external scripts, preventing client-side solutions

## Authentication Modes in Directus

### Three Authentication Modes
1. **JSON Mode**: Returns tokens in response body (what custom frontends use)
2. **Cookie Mode**: Sets `directus_refresh_token` as httpOnly cookie
3. **Session Mode**: Sets `directus_session_token` as httpOnly cookie (what Data Studio uses)

### Key Differences
- **Session tokens** are JWTs that include a `session` field referencing a database session
- **Refresh tokens** are random strings that can be exchanged for access tokens
- Data Studio login uses `mode: "session"` in the `/auth/login` endpoint

### Cookie Analysis from Production
```
Cookie: directus_session_token
Value: JWT token (eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)
Domain: .my-domain.com
Path: /
Max-Age: 86400 (1 day)
HttpOnly: ✓
Secure: ✓
SameSite: None
```

Decoded session token structure:
```json
{
  "id": "user-uuid",
  "role": "role-uuid",
  "app_access": true,
  "admin_access": true,
  "session": "session-id-from-database",  // Critical field!
  "iat": 1757572544,
  "exp": 1757658944,
  "iss": "directus"
}
```

## Attempted Solutions

### Option 1: Mimic Session Token (FAILED)
**Approach**: Create a JWT that matches the session token format

**What we tried**:
1. Set `directus_session_token` cookie instead of `directus_refresh_token`
2. Used the access token as session token
3. Configured cookie with exact same settings as Data Studio

**Why it failed**:
- Access tokens don't have the `session` field
- The session field must reference an actual session in the database
- Directus validates the session internally

**Code changes made** (reverted):
```javascript
// In /magic-link-api/verify
res.cookie('directus_session_token', accessToken, {
  httpOnly: true,
  maxAge: 86400000, // 1 day
  secure: isSecure,
  sameSite: 'None',
  domain: cookieDomain,
  path: '/'
});

// In /magic-link-ui/verify
// Attempted to forward cookies from API response to browser
const setCookieHeader = response.headers.get('set-cookie');
// ... forwarding logic
```

### Option 2A: Temporary Password Approach (NOT IMPLEMENTED)
**Approach**: Set a temporary password and use Directus's normal login flow

**How it would work**:
1. After validating magic link, generate random temporary password
2. Update user's password in database
3. Call Directus `/auth/login` with email + temp password + mode=session
4. Return auto-submitting HTML form that POSTs to `/auth/login`
5. Directus creates proper session and sets cookie

**Pros**:
- Uses official Directus authentication flow
- Should create valid a session
- Works within CSP restrictions (form submission, no JS needed)

**Cons**:
- Modifies user passwords (at least temporarily, unless the original hashed password is stored but that's adding even more complexity to properly restore it later)
- Risk of locking out admin if `ADMIN_EMAIL` (stored in .env) is not protected from password change (i.e. magic links should not work for admin)
- Complicates the clean API design
- Affects custom frontend integration (requires separate modes by endpoint or feature flag)

**Implementation sketch**:
```javascript
// New endpoint: /magic-link-api/verify-session
const tempPassword = crypto.randomBytes(32).toString('hex');

// Protect admin account
if (user.email !== env.ADMIN_EMAIL) {
  await database('directus_users')
    .where({ id: user.id })
    .update({ password: await hashPassword(tempPassword) });
}

// Return HTML with auto-submitting form
return res.send(`
  <form id="loginForm" action="/auth/login" method="POST">
    <input type="hidden" name="email" value="${user.email}">
    <input type="hidden" name="password" value="${tempPassword}">
    <input type="hidden" name="mode" value="session">
  </form>
  <script>document.getElementById('loginForm').submit();</script>
`);
```

### Option 2B: Custom Auth Provider (NOT EXPLORED)
**Approach**: Create a custom authentication provider like OAuth providers

**Challenges**:
- Requires deep Directus customization
- May not be possible with current extension system
- Documentation is limited

### Option 2C: Auth Refresh Hijack (NOT EXPLORED)
**Approach**: Create refresh token and redirect to `/auth/refresh`

**Challenges**:
- Refresh endpoint might expect specific token format
- May not create session tokens

## Cookie Forwarding Issue

### The Problem
When `/magic-link-ui/verify` makes a fetch call to `/magic-link-api/verify`:
- Cookies are set in the fetch response (server context)
- These cookies don't automatically transfer to the user's browser
- We tried forwarding them but hit format/domain issues

### Failed Forwarding Attempt
```javascript
// In /magic-link-ui/verify
const response = await fetch(`/magic-link-api/verify?token=${token}`);
const setCookieHeader = response.headers.get('set-cookie');
// Attempted to split and forward cookies - didn't work properly
```

## Environment Considerations

### Potential NGINX Proxy Setup
- Public URL: `https://my-domain.com/server`
- Internal URL: `http://directus:8056` or `http://172.x.x.x:8056`
- Cookies must handle subdomain and path prefix

### Required Environment Variables
- `PUBLIC_URL`: External URL users access
- `DIRECTUS_INTERNAL_URL`: Internal URL for server-to-server calls (optional but recommended)

## Recommendations

### Short Term (Current Implementation)
1. **Keep the clean separation**: Magic links work for custom frontends
2. **Document the limitation**: Clearly state Data Studio integration isn't supported at this time
3. **Maintain the demo**: Shows developers how to integrate with custom frontends

### Long Term (If Data Studio Integration Is Important)
1. **Option 2A with safeguards**: Implement temporary password approach with:
   - Admin email protection
   - Optional feature flag (`MAGIC_LINK_ENABLE_STUDIO_MODE`)
   - Uses separate endpoint to not affect custom frontends (feature flag could redirect any `/magic-link-ui/verify` (demo endpoint) to `/magic-link-api/verify-session` (a Data Studio login endpoint))

2. **Contribute to Directus Core**: Propose official magic link support in Directus
   - Would require changes to authentication service
   - Could add `mode: "magic-link"` to `/auth/login`

## Resources

- [Directus Authentication Docs](https://directus.io/docs/api/authentication)
- [Tokens & Cookies Guide](https://directus.io/docs/guides/auth/tokens-cookies)
- [GitHub Issue #21757](https://github.com/directus/directus/issues/21757) - Session token security discussion
- [GitHub Issue #7112](https://github.com/directus/directus/issues/7112) - JSON vs Cookie authentication

## Conclusion

While technically possible through workarounds like temporary/permanent password overwriting, Data Studio integration adds significant complexity and potential security concerns. The current implementation focuses on custom frontend integration, which is currently the primary use case identified. The clean API design (`/magic-link-api/generate` and `/magic-link-api/verify`) provides everything needed for custom applications while maintaining security and simplicity.

*This documentation was generated with the help of AI, based on extensive research and experimentation.*