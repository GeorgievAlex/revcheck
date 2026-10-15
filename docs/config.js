// Filled in after `doctl serverless deploy .`:
//   doctl serverless functions get koyakola/compare --url
export const FUNCTION_URL = "";

// Cloudflare Turnstile site key (public). Same widget as RevSofia, since both
// sites live on georgievalex.github.io. Empty disables the Compare button.
export const TURNSTILE_SITEKEY = "0x4AAAAAAFTTvAkEfQ5qFUZe";
