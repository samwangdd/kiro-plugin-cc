import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

export async function withTempHome(run) {
  const home = await mkdtemp(path.join(os.tmpdir(), "kiro-companion-home-"));

  try {
    return await run(home, {
      ...process.env,
      KIRO_COMPANION_HOME: home
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

export async function withTempProject(run) {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "kiro-companion-project-")
  );

  try {
    return await run(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}
