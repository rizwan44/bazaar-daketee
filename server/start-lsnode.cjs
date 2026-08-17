// LiteSpeed's Node.js app launcher (lsnode.js) loads the configured
// "Application startup file" with require() — but this project is a pure ES
// Module package ("type": "module" everywhere), which require() cannot load
// (Node throws ERR_REQUIRE_ESM). A plain .cjs file is always treated as
// CommonJS regardless of that "type" field, so lsnode.js CAN require() this
// one; it immediately hands off to a dynamic import(), which — exactly as
// Node's own error message for this situation suggests — is able to load
// the real ESM entrypoint. dist/index.js starts the HTTP server itself as a
// side effect (it isn't exported/used), which is what keeps the process
// alive, matching how lsnode.js expects a startup file to behave.
import('./dist/index.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
