# 0007. Trust the page author, distrust what arrives later

Status: accepted

## Context

A library must decide what it sanitizes. Sanitizing everything taxes every
consumer for a policy only the application can actually own; sanitizing
nothing makes every consumer an injection waiting to happen.

## Decision

fml trusts the page author and treats everything arriving afterwards as
hostile. Templates, expression modules, translations and the markup are part of
the page's source, trusted by design exactly like the javascript that renders
them; no sanitizer is bundled, because sanitization is application policy, not
library policy. What arrives later (user input, api payloads, urls) reaches the
page through the two safe channels of 0006, and the documented raw hatches are
for author-controlled or app-sanitized values only.

The same line governs httpc: it never evaluates a response body, sends
credentials same-origin only, and its default error branch embeds the response
text in the failure's message, so endpoints whose error pages carry internals
want a custom mapper. And it governs storage: the `revision` of a cached
vocabulary is the page author's to choose, principal included
(`revision="{userId}-v3"`), because only the author knows whether the next
person at a shared browser should see the previous one's options.

## Consequences

- The library ships no sanitizer and no CSP compromises; applications with
  hostile-authored markup must sanitize at their boundary.
- Security review of an fml page is mostly review of `{{{ }}}` usage and of
  what the api is allowed to store: a small, findable surface.
- The storage note in the README exists because the library cannot enforce it:
  the failure mode (served another user's options) is silent.
