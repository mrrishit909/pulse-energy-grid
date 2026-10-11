// Production preview (dist/) on 4331. Other agents' cleanups on this shared machine kill
// detached `vite preview` processes, so the server runs in a child that is restarted on exit.
// `node tests/serve.mjs` = supervisor; `node tests/serve.mjs --child` = the vite preview itself.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes("--child")) {
  const { preview } = await import("vite");
  const s = await preview({ root, preview: { port: 4331, strictPort: true } });
  s.printUrls();
} else {
  let stopping = false;
  const run = () => {
    const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "--child"], { stdio: "inherit" });
    c.on("exit", (code) => {
      if (stopping) return;
      console.error(`[serve] preview exited (${code}); restarting in 500ms`);
      setTimeout(run, 500);
    });
    return c;
  };
  let child = run();
  const stop = () => { stopping = true; child.kill(); process.exit(0); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
