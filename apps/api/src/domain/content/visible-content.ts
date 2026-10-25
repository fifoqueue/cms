import type {
  PublishedContentRepository,
  PublishedCriteria,
} from '#api/domain/content/published-content-repository';

/** Visibility is evaluated on every read; disabling a type never mutates stored entries. */
export class VisibleContentRepository implements PublishedContentRepository {
  constructor(
    private readonly source: PublishedContentRepository,
    private readonly types: () => Promise<readonly string[]>,
  ) {}

  private async visible<T extends { type: string }>(item: T | null) {
    return item && (await this.types()).includes(item.type) ? item : null;
  }

  async byId(id: string) {
    return this.visible(await this.source.byId(id));
  }

  async privateById(id: string) {
    return this.visible(await this.source.privateById(id));
  }

  async bySlug(slug: string) {
    return this.visible(await this.source.bySlug(slug));
  }

  async passwordHash(id: string) {
    return (await this.byId(id)) ? this.source.passwordHash(id) : null;
  }

  async summariesByIds(ids: readonly string[]) {
    const active = new Set(await this.types());
    return (await this.source.summariesByIds(ids)).filter((item) =>
      active.has(item.type),
    );
  }

  private async criteria(criteria: PublishedCriteria) {
    const types = (await this.types()).filter(
      (type) =>
        (!criteria.type || criteria.type === type) &&
        (!criteria.types || criteria.types.includes(type)),
    );
    return { ...criteria, type: undefined, types };
  }

  async list(criteria: PublishedCriteria) {
    return this.source.list(await this.criteria(criteria));
  }

  async summaries(criteria: PublishedCriteria) {
    return this.source.summaries(await this.criteria(criteria));
  }

  async adjacent(id: string) {
    if (!(await this.byId(id))) return { previous: null, next: null };
    const { previous, next } = await this.source.adjacent(id);
    return {
      previous: await this.visible(previous),
      next: await this.visible(next),
    };
  }

  async months(types: readonly string[], limit: number) {
    const active = new Set(await this.types());
    return this.source.months(
      types.filter((type) => active.has(type)),
      limit,
    );
  }

  async monthNeighbours(types: readonly string[], year: number, month: number) {
    const active = new Set(await this.types());
    return this.source.monthNeighbours(
      types.filter((type) => active.has(type)),
      year,
      month,
    );
  }
}
