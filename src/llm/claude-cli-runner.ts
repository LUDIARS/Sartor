import { execFile, type ChildProcess } from "node:child_process";

import { logError, logInfo } from "../log.js";

import { createClaudeCliPathResolver } from "./claude-cli-path.js";

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const SAFE_MODEL_NAME = /^[a-z0-9][a-z0-9._:-]*$/iu;

export class ClaudeCliExecutionError extends Error {
  public constructor(detail: string) {
    super(`claude CLI の実行に失敗しました: ${detail}`);
    this.name = "ClaudeCliExecutionError";
  }
}

export interface ClaudeCliRunner {
  complete(prompt: string): Promise<string>;
}

export interface ClaudeCliRunnerOptions {
  readonly execFileImpl?: typeof execFile;
  readonly resolveCliPath?: () => Promise<string>;
  readonly model?: string;
  readonly timeoutMs?: number;
}

/** shell 経由でも引数として安全な Claude model 名を解決する。 */
export function resolveClaudeCliModel(configured: string | undefined = process.env.SARTOR_CLAUDE_MODEL): string {
  const model = configured?.trim() || "claude-opus-5";
  if (!SAFE_MODEL_NAME.test(model)) {
    throw new ClaudeCliExecutionError("SARTOR_CLAUDE_MODEL に無効な文字が含まれています。");
  }
  return model;
}

/** ローカルにログイン済みの Claude Code CLI を stdin プロンプトで実行する。 */
export function createClaudeCliRunner(options: ClaudeCliRunnerOptions = {}): ClaudeCliRunner {
  const exec = options.execFileImpl ?? execFile;
  const resolver = createClaudeCliPathResolver(exec);
  const resolveCliPath = options.resolveCliPath ?? (() => resolver.resolve());
  const model = resolveClaudeCliModel(options.model);
  const timeoutMs = options.timeoutMs ?? configuredTimeoutMs();

  return {
    async complete(prompt: string): Promise<string> {
      const startedAt = Date.now();
      logInfo("llm_cli_started", { model });
      try {
        const cliPath = await resolveCliPath();
        const output = await runClaudeCli(exec, cliPath, prompt, model, timeoutMs);
        logInfo("llm_cli_completed", { model, durationMs: Date.now() - startedAt });
        return output;
      } catch (error) {
        logError("llm_cli_failed", {
          model,
          durationMs: Date.now() - startedAt,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        throw error;
      }
    },
  };
}

function configuredTimeoutMs(): number {
  const configured = Number(process.env.SARTOR_CLAUDE_TIMEOUT_MS);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function needsShell(cliPath: string): boolean {
  return process.platform === "win32" && /\.(cmd|bat)$/iu.test(cliPath);
}

function runClaudeCli(
  exec: typeof execFile,
  cliPath: string,
  prompt: string,
  model: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const shell = needsShell(cliPath);
    if (shell && /["%!\r\n]/u.test(cliPath)) {
      throw new ClaudeCliExecutionError("claude CLI のパスを安全に shell へ渡せません。");
    }
    const command = shell ? `"${cliPath}"` : cliPath;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (finish: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      finish();
    };

    const child = exec(
      command,
      ["-p", "--model", model, "--output-format", "text"],
      { maxBuffer: MAX_OUTPUT_BYTES, shell, windowsHide: true },
      (error, stdout, stderr) => {
        settle(() => {
          if (error !== null) {
            const detail = stderr.toString().trim().slice(0, 300) || error.message;
            reject(new ClaudeCliExecutionError(detail));
            return;
          }
          const response = stdout.toString().trim();
          if (response.length === 0) {
            reject(new ClaudeCliExecutionError("応答が空です。"));
            return;
          }
          resolve(response);
        });
      },
    );

    timer = setTimeout(() => {
      settle(() => {
        killProcessTree(exec, child);
        reject(new ClaudeCliExecutionError(`${timeoutMs} ms で応答しません。`));
      });
    }, timeoutMs);

    child.stdin?.on("error", () => {
      // The execFile callback owns the outcome; prevent a duplicate EPIPE event from becoming uncaught.
    });
    child.stdin?.end(prompt, "utf8");
  });
}

function killProcessTree(exec: typeof execFile, child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    exec("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {
      // The timeout has already rejected; process-tree cleanup is best-effort.
    });
    return;
  }
  child.kill("SIGKILL");
}
