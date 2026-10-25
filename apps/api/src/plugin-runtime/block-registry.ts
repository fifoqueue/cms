import {
  pluginBlockAttrsSchema,
  pluginBlockDeclarationSchema,
  pluginBlockValues,
} from '@cms/sdk';
import type { ContentDocument, PluginBlockInfo } from '@cms/sdk';
import type {
  BlockDefinition,
  BlockRegistrar,
  BlockRenderContext,
} from '@cms/sdk/plugin';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import { invalidInput, Errors, withParams } from '#api/shared/errors';

interface Registration {
  block: string;
  owner: string;
  info: PluginBlockInfo;
  definition: BlockDefinition;
}

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The marker the shared schema renders for a `pluginBlock` node. */
const MARKER =
  /<div class="cms-plugin-block" data-plugin-block="([^"]*)" data-attrs="([^"]*)"><\/div>/g;

const unescapeAttribute = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const storedAttrs = (raw: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(unescapeAttribute(raw));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

/**
 * Dynamic blocks plugins add to the editor (WordPress `register_block_type`). Content stores a
 * generic `pluginBlock` node; while the plugin is active its attributes are checked on save and
 * the plugin renders it when content is served. Blocks of inactive plugins stay stored and
 * render nothing.
 */
export class BlockRegistry {
  private registrations: Registration[] = [];

  constructor(
    private readonly options: { timeoutMs: number; logger: Logger },
  ) {}

  registrar(owner: string): BlockRegistrar {
    return {
      register: (key, definition) => {
        const declared = pluginBlockDeclarationSchema.safeParse({
          title: definition.title,
          description: definition.description,
          attributes: definition.attributes,
        });
        if (!KEY.test(key) || !declared.success)
          throw new Error(Errors.PluginBlockInvalid(key));
        const block = `plugin:${owner}:${key}`;
        const registration = {
          block,
          owner,
          info: { ...declared.data, block },
          definition,
        };
        this.registrations = [...this.registrations, registration];
        return () => {
          this.registrations = this.registrations.filter(
            (entry) => entry !== registration,
          );
        };
      },
    };
  }

  /** Active blocks, for the editor's inserter. */
  list(): PluginBlockInfo[] {
    return this.registrations.map(({ info }) => structuredClone(info));
  }

  private find(block: unknown) {
    return this.registrations.find((entry) => entry.block === block);
  }

  /**
   * Checks the attributes of active plugins' blocks in `document` against their declarations;
   * throws `invalid_input` for the first mismatch. Blocks of inactive plugins are kept as stored.
   */
  check(document: ContentDocument) {
    const stack: unknown[] = [document];
    while (stack.length) {
      const node = stack.pop() as {
        type?: unknown;
        attrs?: { block?: unknown; attrs?: unknown };
        content?: unknown;
      };
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node.content)) stack.push(...node.content);
      if (node.type !== 'pluginBlock') continue;
      const registration = this.find(node.attrs?.block);
      if (
        registration &&
        !pluginBlockAttrsSchema(registration.info.attributes).safeParse(
          node.attrs?.attrs ?? {},
        ).success
      )
        throw invalidInput(
          Errors.PluginBlockAttrsInvalid,
          withParams(
            Errors.PluginBlockAttrsInvalid,
            { title: registration.info.title },
            'document',
          ),
        );
    }
  }

  /**
   * Replaces plugin block markers in served HTML with their plugins' output. Each distinct
   * block and attribute set renders once per call; failures, timeouts and inactive plugins
   * render nothing, so a block never breaks the page.
   */
  async expand(
    html: string,
    context: BlockRenderContext = { content: null },
  ): Promise<string> {
    if (!html.includes('data-plugin-block')) return html;
    const rendered = new Map<string, Promise<string>>();
    const render = (block: string, raw: string) => {
      const registration = this.find(unescapeAttribute(block));
      if (!registration) return Promise.resolve('');
      const key = `${registration.block}\n${raw}`;
      let output = rendered.get(key);
      if (!output) {
        const values = pluginBlockValues(
          registration.info.attributes,
          storedAttrs(raw),
        );
        output = isolate(
          () =>
            this.registrations.includes(registration)
              ? registration.definition.render(values, structuredClone(context))
              : '',
          this.options.timeoutMs,
        ).then((result) => {
          if (!this.registrations.includes(registration)) return '';
          if (result.ok && typeof result.value === 'string')
            return result.value;
          this.options.logger.warn(
            `Plugin "${registration.owner}" failed to render block "${registration.block}": ${result.ok ? 'returned a non-string value' : result.error.message}`,
          );
          return '';
        });
        rendered.set(key, output);
      }
      return output;
    };
    const matches = [...html.matchAll(MARKER)];
    const outputs = await Promise.all(
      matches.map(([, block, raw]) => render(block ?? '', raw ?? '')),
    );
    let index = 0;
    return html.replace(MARKER, () => outputs[index++] ?? '');
  }
}
