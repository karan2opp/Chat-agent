// Starts Postgres before `npm run dev`, with a readable error if Docker isn't running.
import { spawnSync } from "node:child_process";

const result = spawnSync("docker", ["compose", "up", "-d", "--wait"], { stdio: "inherit", shell: true });

if (result.status !== 0) {
  console.error("\nCould not start Postgres. Make sure Docker is installed and running, then run `npm run dev` again.");
  process.exit(1);
}
