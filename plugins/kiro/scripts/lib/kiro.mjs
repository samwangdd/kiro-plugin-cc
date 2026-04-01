import { spawn } from "node:child_process";

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function buildChatArgs({
  prompt,
  model = null,
  agent = null,
  resume = false
}) {
  const args = ["chat"];

  if (resume) {
    args.push("--resume");
  } else {
    args.push("--no-interactive", "--trust-all-tools");
  }

  if (model) {
    args.push("--model", model);
  }

  if (agent) {
    args.push("--agent", agent);
  }

  if (prompt) {
    args.push(prompt);
  }

  return args;
}

export async function runKiro(
  args,
  { cwd = process.cwd(), env = process.env, spawnImpl = spawn, timeoutMs = 300000 } = {}
) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl("kiro-cli", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`kiro-cli timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

export async function getSetupReport({
  cwd = process.cwd(),
  env = process.env,
  run = runKiro
} = {}) {
  const version = await run(["version"], { cwd, env }).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));

  if (version.code !== 0) {
    return {
      ready: false,
      installed: false,
      loggedIn: false,
      version: "",
      whoami: null,
      models: []
    };
  }

  const whoami = await run(["whoami", "--format", "json"], { cwd, env }).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));
  const models = await run(["chat", "--list-models", "--format", "json"], { cwd, env }).catch(
    () => ({
      code: 1,
      stdout: "[]",
      stderr: ""
    })
  );

  const whoamiJson = parseJson(whoami.stdout, null);
  const modelList = parseJson(models.stdout, []);

  return {
    ready: whoami.code === 0,
    installed: true,
    loggedIn: whoami.code === 0,
    version: version.stdout.trim(),
    whoami: whoamiJson,
    models: Array.isArray(modelList) ? modelList : []
  };
}
