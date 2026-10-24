import { CodeBlock } from '@tiptap/extension-code-block';
import { codeBlockAttributesSchema } from '@cms/sdk/code-block';

export const EnhancedCodeBlock = CodeBlock.extend({
  addAttributes() {
    const defaults = codeBlockAttributesSchema.parse({});
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        {
          default: value,
          parseHTML: (element: HTMLElement) => {
            const raw =
              element.getAttribute(`data-code-${key.toLowerCase()}`) ??
              (key === 'language'
                ? element
                    .querySelector('code')
                    ?.className.match(/language-(\S+)/)?.[1]
                : null);
            if (raw === null || raw === undefined) return value;
            const candidate =
              typeof value === 'boolean'
                ? raw === 'true'
                : typeof value === 'number'
                  ? Number(raw)
                  : raw || value;
            const field =
              codeBlockAttributesSchema.shape[key as keyof typeof defaults];
            const parsed = field.safeParse(candidate);
            return parsed.success ? parsed.data : value;
          },
          renderHTML: (attrs: Record<string, unknown>) => ({
            [`data-code-${key.toLowerCase()}`]: attrs[key],
          }),
        },
      ]),
    );
  },
});
