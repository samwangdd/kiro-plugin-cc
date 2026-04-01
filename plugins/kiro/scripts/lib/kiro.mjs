import { spawn } from "node:child_process";

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function isValidWhoami(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.username === "string" &&
    value.username.trim().length > 0
  );
}

function isValidModelList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
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
  const loggedIn = whoami.code === 0 && isValidWhoami(whoamiJson);
  const modelsValid = models.code === 0 && isValidModelList(modelList);

  return {
    ready: Boolean(loggedIn && modelsValid),
    installed: true,
    loggedIn: Boolean(loggedIn),
    version: version.stdout.trim(),
    whoami: loggedIn ? whoamiJson : null,
    models: modelsValid ? modelList : []
  };
}
