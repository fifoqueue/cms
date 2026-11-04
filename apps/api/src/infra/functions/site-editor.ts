import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  functionsInputSchema,
  functionsStatusSchema,
} from '@cms/sdk/functions';
import type { FunctionsEditor } from '#api/functions-runtime/functions-editor';
import type { FunctionsHost } from '#api/functions-runtime/functions-host';
import type { Logger } from '#api/shared/logger';
import { forbidden } from '#api/shared/errors';
import { validateFunctions } from '#api/infra/functions/validate-source';
import { parseInput } from '#api/shared/validation';

export class SiteEditor implements FunctionsEditor {
  constructor(
    private readonly directory: string,
    private readonly enabled: boolean,
    private readonly host: FunctionsHost,
    private readonly logger: Logger,
  ) {}

  private async gate(): Promise<boolean> {
    if (this.enabled) return true;
    try {
      await access(join(this.directory, 'editor.enabled'));
      return true;
    } catch {
      return false;
    }
  }

  private async requireGate(): Promise<void> {
    if (!(await this.gate())) throw forbidden();
  }

  async read(): Promise<{ source: string }> {
    await this.requireGate();
    try {
      return {
        source: await readFile(join(this.directory, 'site.ts'), 'utf8'),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { source: '' };
      throw error;
    }
  }

  async validate(input: unknown): Promise<{ valid: true }> {
    await this.requireGate();
    const { source } = parseInput(functionsInputSchema, input);
    validateFunctions(source);
    return { valid: true };
  }

  async write(input: unknown, actor: string) {
    await this.validate(input);
    const { source } = parseInput(functionsInputSchema, input);
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `.write-${randomUUID()}.ts`);
    try {
      await writeFile(temporary, source, { flag: 'wx', mode: 0o600 });
      await this.requireGate();
      await rename(temporary, join(this.directory, 'site.ts'));
    } finally {
      await rm(temporary, { force: true });
    }
    this.logger.info('Site functions updated', { actor });
    await this.host.reconcile();
    return this.status();
  }

  async status() {
    return functionsStatusSchema.parse({
      editorEnabled: await this.gate(),
      checkedAt: new Date().toISOString(),
      sources: this.host.status(),
    });
  }
}
