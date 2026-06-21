// Custom Windows code-signing hook for electron-builder.
//
// It exists to work around two problems specific to this project's environment:
//
//  1. asar-integrity crash: electron-builder (v26) + Electron 39 embed an
//     asar-integrity hash that does not match what Electron recomputes at
//     runtime, so the packaged app dies on launch with
//     "FATAL ... Integrity check failed for asar archive". electron-builder
//     ignores `electronFuses.enableEmbeddedAsarIntegrityValidation: false`
//     and force-enables the validation fuse. This hook runs AFTER
//     electron-builder's @electron/fuses step (signing is the last per-file
//     step), so flipping the fuse off here on the main app executable sticks.
//
//  2. unreachable timestamp server: the build machine cannot reach the public
//     RFC-3161 timestamp servers, which makes electron-builder's default
//     signtool invocation fail. We sign without a timestamp instead — the
//     self-signed cert is valid until 2029, which is acceptable for this
//     internal, manually-trusted distribution.
//
// Configured via package.json -> build.win.signtoolOptions.sign.

const { existsSync } = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

const CERT_SHA1 = "E950B2D3C22831B0EDE52E0F69D7C0C422BCBE02";
const MAIN_EXE_NAME = "Top Gear Car Wash.exe";

const SIGNTOOL_CANDIDATES = [
  "C:\\Users\\amrha\\AppData\\Local\\electron-builder\\Cache\\winCodeSign\\winCodeSign-2.6.0\\windows-10\\x64\\signtool.exe",
  "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe",
];

function findSigntool() {
  const found = SIGNTOOL_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error("signtool.exe not found in any known location.");
  return found;
}

exports.default = async function sign(configuration) {
  const file = configuration.path;

  // Disable the broken asar-integrity validation fuse on the main app exe only.
  // Flipping a fuse rewrites the PE, so it must happen before we sign the file.
  if (path.basename(file) === MAIN_EXE_NAME) {
    await flipFuses(file, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      resetAdHocDarwinSignature: false,
    });
    console.log(`[sign-win] disabled asar-integrity fuse on ${MAIN_EXE_NAME}`);
  }

  execFileSync(
    findSigntool(),
    ["sign", "/sha1", CERT_SHA1, "/fd", "sha256", file],
    { stdio: "inherit" }
  );
  console.log(`[sign-win] signed ${path.basename(file)}`);
};
