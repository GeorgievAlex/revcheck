// Filled in after `doctl serverless deploy .`:
//   doctl serverless functions get revcheck/compare --url
export const FUNCTION_URL = "https://faas-fra1-afec6ce7.doserverless.co/api/v1/web/fn-a1b201b0-a459-4354-8a04-0f6269b1db4f/revcheck/compare";

// Cloudflare Turnstile site key (public). Same widget as RevSofia, since both
// sites live on georgievalex.github.io. Empty disables the Compare button.
export const TURNSTILE_SITEKEY = "0x4AAAAAAFTTvAkEfQ5qFUZe";
