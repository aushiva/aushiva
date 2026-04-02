import { spawn } from "child_process";

const backend = spawn("npm", ["--prefix", "backend", "run", "dev"], {
  stdio: "inherit",
  shell: true
});

const frontend = spawn("npm", ["run", "dev:frontend"], {
  stdio: "inherit",
  shell: true
});

function shutdown(signal) {
  if (backend.exitCode === null) backend.kill(signal);
  if (frontend.exitCode === null) frontend.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

backend.on("exit", (code) => {
  if (code && frontend.exitCode === null) {
    frontend.kill("SIGTERM");
    process.exit(code);
  }
});

frontend.on("exit", (code) => {
  if (code && backend.exitCode === null) {
    backend.kill("SIGTERM");
    process.exit(code);
  }
});
