# Superset Journey — Issues

## Issue: Documented login submit selector `button:has-text("Sign in")` does not match the Superset login form

**Severity:** Low (documentation / verification-selector defect; workaround available)
**Discovered:** rerun `rr-superset-0717`, `apache/superset:4.1.1`, westus AKS
**Status:** Worked around in `scripts/capture-screenshot.mjs`; journey docs should be corrected.

### What the journey says
`JOURNEY.md` (Step 4) and `.github/skills/superset-azure/SKILL.md` state:

> Automated browser verification must target `#username`, `#password`, and
> `button:has-text("Sign in")`; the React form doesn't expose `name="username"`.

### What actually renders
The Superset login page (`/login/`) is the server-rendered **Flask-AppBuilder (FAB)** form, not a React component. Observed markup:

```html
<form class="form" action="" method="post" name="login">
  <input id="username" name="username" type="text" ...>
  <input id="password" name="password" type="password" ...>
  <input class="btn btn-primary btn-block" type="submit" value="Sign In">
</form>
```

Two inaccuracies in the documented guidance:

1. **Submit control is not a `<button>`.** It is `<input type="submit" value="Sign In">`. Playwright's `button:has-text('Sign in')` matches only `<button>` elements, and `has-text` inspects text content — an `<input>`'s label lives in the `value` attribute — so the documented selector matches **zero** elements and login times out.
2. **The form is not React and *does* expose `name="username"`/`name="password"`.** The claim that "the React form doesn't expose `name="username"`" is incorrect for this image; both `id` and `name` attributes are present.

The `#username` and `#password` selectors are correct and did work.

### Impact
Any verification following the documented selector verbatim fails at the submit step even though the deployment is fully healthy (pod 1/1, PostgresqlImpl, `/health` 200).

### Workaround applied
`scripts/capture-screenshot.mjs` attempts the documented `button:has-text('Sign in')` first, then falls back to `input[type="submit"], button[type="submit"]`. With the fallback, login succeeds and navigates to `/superset/welcome/`.

### Suggested fix
Update `JOURNEY.md` and `superset-azure/SKILL.md` to use a submit selector that matches the FAB form, e.g. `input[type="submit"]` (or a resilient `input[type=submit], button[type=submit]`), and remove the inaccurate "React form / no `name=username`" note.

---

## Issue: clean `azd up` failed when hook-owned secrets weren't pre-seeded

**Status:** Resolved and live-verified in the predictability deployment.

Azure infrastructure, including AKS and PostgreSQL, provisioned successfully. The original post-provision hook then failed because `SUPERSET_SECRET_KEY` and `SUPERSET_ADMIN_PASSWORD` were undocumented required environment values.

The cross-platform Node hook now generates cryptographically random values when either variable is absent, persists them with `azd env set`, never prints them, and reuses existing values on reruns. The repaired hook completed Helm installation, Kubernetes secret creation, Superset rollout, ingress discovery, PostgreSQL verification, `/health` verification, and authenticated browser login.
