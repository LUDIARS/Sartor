import { execFile } from "node:child_process";

/** Claude Code CLI が PATH 上で利用できないことを表す。 */
export class ClaudeCliUnavailableError extends Error {
  public constructor(detail: string) {
    super(`claude CLI を実行できません: ${detail}`);
    this.name = "ClaudeCliUnavailableError";
  }
}

const LOOKUP_TIMEOUT_MS = 5_000;

export interface ClaudeCliPathResolver {
  resolve(): Promise<string>;
}

/** 成功した解決結果だけを保持する claude CLI パス解決器を作る。 */
export function createClaudeCliPathResolver(
  execFileImpl: typeof execFile = execFile,
): ClaudeCliPathResolver {
  let cachedPath: Promise<string> | undefined;
  return {
    resolve(): Promise<string> {
      if (cachedPath === undefined) {
        cachedPath = lookupClaudeCli(execFileImpl).catch((error: unknown) => {
          cachedPath = undefined;
          throw error;
        });
      }
      return cachedPath;
    },
  };
}

function lookupClaudeCli(exec: typeof execFile): Promise<string> {
  const finder = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve, reject) => {
    exec(finder, ["claude"], { timeout: LOOKUP_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      if (error !== null) {
        reject(new ClaudeCliUnavailableError(`${finder} claude が失敗しました。`));
        return;
      }
      const cliPath = stdout
        .toString()
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (cliPath === undefined) {
        reject(new ClaudeCliUnavailableError("PATH に claude がありません。"));
        return;
      }
      resolve(cliPath);
    });
  });
}
