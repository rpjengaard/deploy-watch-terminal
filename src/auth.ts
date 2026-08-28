import { spawn } from 'node:child_process';

const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';

export class AuthError extends Error {}

export interface TokenProvider {
  header(): Promise<string>;
  invalidate(): void;
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `${cmd} exited ${code}`))));
  });
}

export function createTokenProvider(): TokenProvider {
  const pat = process.env.AZDO_PAT;
  if (pat) {
    const h = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
    return { header: async () => h, invalidate() {} };
  }
  let cached: string | undefined;
  let inflight: Promise<string> | undefined;
  return {
    async header() {
      if (cached) return `Bearer ${cached}`;
      inflight ??= run('az', ['account', 'get-access-token', '--resource', ADO_RESOURCE, '--query', 'accessToken', '-o', 'tsv'])
        .then((t) => {
          cached = t;
          return t;
        })
        .catch((e) => {
          throw new AuthError(`az token failed: ${e.message}. Run \`az login\`.`);
        })
        .finally(() => (inflight = undefined));
      return `Bearer ${await inflight}`;
    },
    invalidate() {
      cached = undefined;
    },
  };
}
