import type { PageRender, SlotMap } from '@cms/sdk';
import type { WebHeadTag } from '@cms/sdk/functions';

export type PageSlots = SlotMap & {
  presentation?: {
    render: PageRender;
    head: WebHeadTag[];
    headHtml: string;
    footerHtml: string;
  };
};
