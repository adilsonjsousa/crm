import { spawn } from "node:child_process";

const port = process.env.PORT || "4173";

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "preview", "--host", "0.0.0.0", "--port", String(port)],
  { stdio: "inherit" }
);

child.on("exit", (code) => {
  process.exit(code || 0);
});
