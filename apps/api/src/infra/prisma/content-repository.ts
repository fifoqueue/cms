import type { ContentDocument } from '@cms/sdk';
import type {
  ContentCriteria,
  ContentRecord,
  ContentRepository,
} from '../../domain/content/content-repository';
import { guardUnique } from './client';
import type { Database } from './client';
import type { Content } from './generated/client';

const toRecord = ({ document, ...row }: Content): ContentRecord => ({
  ...row,
  document: JSON.parse(document) as ContentDocument,
});

const toRow = ({ document, ...record }: ContentRecord): Content => ({
  ...record,
  document: JSON.stringify(document),
});

export class PrismaContentRepository implements ContentRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string) {
    const row = await this.db.content.findUnique({ where: { id } });
    return row && toRecord(row);
  }

  async findBySlug(slug: string) {
    const row = await this.db.content.findUnique({ where: { slug } });
    return row && toRecord(row);
  }

  async list({ type, status, page, pageSize, orderBy }: ContentCriteria) {
    const where = { type, status };
    const [rows, total] = await this.db.$transaction([
      this.db.content.findMany({
        where,
        orderBy: [{ [orderBy]: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.content.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async insert(record: ContentRecord) {
    await guardUnique(
      () => this.db.content.create({ data: toRow(record) }),
      'Slug is already in use',
    );
  }

  async update(record: ContentRecord) {
    const { id, ...data } = toRow(record);
    await guardUnique(
      () => this.db.content.update({ where: { id }, data }),
      'Slug is already in use',
    );
  }

  async delete(id: string) {
    await this.db.content.deleteMany({ where: { id } });
  }
}
