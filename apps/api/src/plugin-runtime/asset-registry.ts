import { pageAssetSchema } from '@cms/sdk';
import type { AssetDefinition, PageAsset, RenderPage } from '@cms/sdk';
import { parseInput } from '#api/shared/validation';
import { isolate } from '#api/shared/isolate';

interface Entry {
  owner: string;
  asset: PageAsset;
  when?: AssetDefinition['when'];
}

export class AssetRegistry {
  private entries: Entry[] = [];

  constructor(
    private readonly timeoutMs: number,
    private readonly invalidate: () => void = () => {},
  ) {}

  get empty() {
    return this.entries.length === 0;
  }

  register(owner: string, key: string, definition: AssetDefinition) {
    const asset = parseInput(pageAssetSchema, { ...definition, key });
    const entry = { owner, asset, when: definition.when };

    this.entries.push(entry);
    this.invalidate();

    return () => {
      this.entries = this.entries.filter((item) => item !== entry);
      this.invalidate();
    };
  }

  async resolve(page: RenderPage): Promise<PageAsset[]> {
    const assets = new Map<string, PageAsset>();

    for (const entry of this.entries.slice()) {
      if (!this.entries.includes(entry)) continue;

      if (entry.when) {
        const result = await isolate(
          () => entry.when!(structuredClone(page)),
          this.timeoutMs,
        );

        if (!result.ok || result.value !== true) continue;
      }

      if (this.entries.includes(entry))
        assets.set(entry.asset.key, structuredClone(entry.asset));
    }

    return [...assets.values()];
  }
}
