import type { Capability } from '#sdk/capabilities';
import type { Awaitable } from '#sdk/common';
import type { AdminBlock } from '#sdk/plugins';
import type { PageAsset } from '#sdk/render';
import type { AdminScreen, AdminScreenResponse } from '#sdk/admin-ui';

export interface AdminNoticeDefinition {
  capability?: Capability;
  screens?: string[];
  render(): Awaitable<AdminBlock[]>;
}

export interface AdminColumnDefinition {
  label: string;
  capability?: Capability;
  values(ids: string[]): Awaitable<Record<string, string>>;
}

export interface AdminRowActionDefinition {
  label: string;
  capability: Capability;
  run(id: string): Awaitable<{ notice?: AdminBlock }>;
}

export interface AdminBulkActionDefinition {
  label: string;
  capability: Capability;
  run(ids: string[]): Awaitable<{ notice?: AdminBlock; failed?: string[] }>;
}

export interface AdminFilterDefinition {
  label: string;
  capability?: Capability;
  options: AdminScreenResponse['filters'][number]['options'];
  apply(query: Record<string, unknown>): Awaitable<Record<string, unknown>>;
}

export type AdminAssetDefinition = Omit<PageAsset, 'key'> & {
  capability?: Capability;
  screens?: string[];
};

export interface AdminUiRegistrar {
  notice(key: string, definition: AdminNoticeDefinition): () => void;
  column(
    screen: AdminScreen,
    key: string,
    definition: AdminColumnDefinition,
  ): () => void;
  rowAction(
    screen: AdminScreen,
    key: string,
    definition: AdminRowActionDefinition,
  ): () => void;
  bulkAction(
    screen: AdminScreen,
    key: string,
    definition: AdminBulkActionDefinition,
  ): () => void;
  filter(
    screen: AdminScreen,
    key: string,
    definition: AdminFilterDefinition,
  ): () => void;
  assets(key: string, definition: AdminAssetDefinition): () => void;
}
