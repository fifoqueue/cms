import { readFileSync } from 'node:fs';
import { mkdir, open, link, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { databaseUrlSchema } from '../../config';

export const API_DIRECTORY = fileURLToPath(
  new URL('../../../', import.meta.url),
);
export const INSTALLATION_CONFIG = join(API_DIRECTORY, 'data/config.json');

const storedSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
});

export const readInstallationConfig = (path = INSTALLATION_CONFIG) => {
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(
      '설정 파일을 읽을 수 없습니다. 파일 접근 권한을 확인해 주세요.',
      { cause: error },
    );
  }
  try {
    return storedSchema.parse(JSON.parse(source));
  } catch {
    throw new Error('설정 파일이 손상되었습니다. 기존 설정을 복구해 주세요.');
  }
};

/** Publish a complete file without replacing an existing installation. */
export const saveInstallationConfig = async (
  databaseUrl: string,
  path = INSTALLATION_CONFIG,
) => {
  const values = storedSchema.parse({ DATABASE_URL: databaseUrl });
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(values), 'utf8');
    await handle.sync();
    await handle.close();
    await link(temporary, path);
  } finally {
    await handle.close();
    await unlink(temporary);
  }
};
