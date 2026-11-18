import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
const repo = process.argv[2];
if (!repo || !existsSync(join(repo, "banklink/website/package.json")))
  throw new Error("Pass the path to an Aurvex checkout.");
const target = resolve(
  repo,
  "banklink/website/src/components/examples/accounting",
);
mkdirSync(target, { recursive: true });
for (const name of ["AccountingApp.tsx", "model.ts", "accounting.css"])
  copyFileSync(resolve("shared", name), join(target, name));
console.log("Synchronized shared accounting interface and model.");
