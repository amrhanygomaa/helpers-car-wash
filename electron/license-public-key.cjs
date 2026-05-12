// SECURITY: Public key is hardcoded — never allow ENV override.
// This prevents attackers from replacing the key with their own keypair.
const LICENSE_PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAibBzohH3X/2uMYDa0Mu88bu03d+bTNVfNYzDCOX6Cgc=\n-----END PUBLIC KEY-----\n";

// Freeze to prevent runtime mutation via require cache
Object.freeze(module.exports = { LICENSE_PUBLIC_KEY });
