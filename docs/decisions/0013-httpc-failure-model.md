# 0013. httpc answers failures, not exceptions of last resort

Status: accepted

## Context

Fetch's error surface is bifurcated (network rejects, http statuses resolve)
and its defaults are wrong for same-origin apps (credentials, error bodies).

## Decision

`httpc` wraps fetch behind a builder (`withCsrfToken()`, per-request
`params`/`headers`/encodings) and normalizes both failure kinds into one
`Failure` value carrying typed `problems` (field-routed contexts included):
an error status becomes an `HttpClientError` (a `Failure`) with the served
status, a transport failure a `CONNECTION_PROBLEM`, and a throw from the
chain's own code an `UNEXPECTED_PROBLEM` carrying the original as its cause.
Turning a failure into text is localization's job, not the client's:
`Localization.failure` (0012) reads the reasons, and a problem with no reason
reads as the localized `failure.no-reason`. Credentials are same-origin only,
fetch's default, chosen explicitly. Nullish values in `params` are skipped,
and a parameter left with none is removed rather than serialized as `null`,
which is the pagination/filter contract the loaders rely on. The csrf
header/token pair is read per request from the page's metas and sent to the
page's origin only, so a rotated token does not outlive the request that used
it.

A loader or form handler that catches inspects `instanceof httpc.Failure`;
anything else is a genuine exception and is reported as one.

## Consequences

- Consumers write one error path, not two; the problems' `context` routing is
  what server-side validation rides on (0011).
- The default failure message embeds the response text, documented as a
  foot-gun for endpoints whose error pages carry internals, with the custom
  `responseMapper` as the named way out.
- `client-errors` (the standalone IIFE) follows the same posture: it reports
  and swallows its own failures, so an unreachable endpoint is never
  re-reported as an error.
