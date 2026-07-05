
### version 7.0.0

**BREAKING** : Changed the implicit default behavior of AsyncEvents.fireAsync from a single-value interception to a parallel 'broadcast' (which now returns an array of all resolved listener values). To maintain the previous behavior of intercepting a single return value from a middleware handler, you must now explicitly pass { mode: 'pipeline' }.

**jsconfig target**: jsconfig.json target is now "ES2024", was: "ES2022"