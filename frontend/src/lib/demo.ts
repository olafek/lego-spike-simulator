// The public demo lives under /demo (pages) and /demo/api (data). Everything else is the lab.
// The server enforces the difference; this only tells the app which address to talk to.

export const DEMO = typeof location !== 'undefined' && /^\/demo(\/|$)/.test(location.pathname)

/** Prefix for page routes and API calls: '/demo' in the demo, '' in the lab. */
export const BASE = DEMO ? '/demo' : ''
