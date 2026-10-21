import { spawn } from 'bun';
import { fileURLToPath } from 'node:url';
import type { DatabaseSetupInput } from '@cms/sdk';
import { createDatabase } from '../prisma/client';
import { invalidInput } from '../../shared/errors';
import { API_DIRECTORY } from './config-store';

export const databaseUrl = (input: DatabaseSetupInput) => {
  const host =
    input.host.includes(':') && !input.host.startsWith('[')
      ? `[${input.host}]`
      : input.host;
  return `mysql://${encodeURIComponent(input.username)}:${encodeURIComponent(input.password)}@${host}:${input.port ?? 3306}/${encodeURIComponent(input.database)}`;
};

/** Credentials only travel through the child environment, never argv or logs. */
export const prepareDatabase = async (url: string) => {
  const db = createDatabase(url);
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    throw invalidInput(
      '데이터베이스에 연결할 수 없습니다. 주소·계정·데이터베이스 이름과 접근 권한을 확인해 주세요.',
    );
  } finally {
    await db.$disconnect();
  }
  const migration = spawn({
    cmd: [
      process.execPath,
      fileURLToPath(import.meta.resolve('prisma/build/index.js')),
      'migrate',
      'deploy',
    ],
    cwd: API_DIRECTORY,
    env: { ...process.env, DATABASE_URL: url.replace(/^mariadb:/, 'mysql:') },
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: 120_000,
  });
  if ((await migration.exited) !== 0)
    throw invalidInput(
      '테이블 준비에 실패했습니다. DB 계정의 테이블 생성 권한과 마이그레이션 상태를 확인해 주세요. 기존 데이터는 초기화하지 않습니다.',
    );
};
