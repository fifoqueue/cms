import type { PageAsset } from '@cms/sdk';

/** The registered stylesheets placed at `placement`. */
export const stylesAt = (
  assets: readonly PageAsset[],
  placement: PageAsset['placement'],
) =>
  assets.filter(
    (asset) => asset.kind === 'style' && asset.placement === placement,
  );

/**
 * Adds the registered scripts of the current admin screen that this document does not have yet
 * (matched by `data-cms-asset` key), so each script runs once per document however often its
 * screen is visited. Scripts are never removed. Browser only.
 */
export const addScripts = (assets: readonly PageAsset[]) => {
  for (const asset of assets) {
    if (
      asset.kind !== 'script' ||
      document.querySelector(
        `script[data-cms-asset="${CSS.escape(asset.key)}"]`,
      )
    )
      continue;
    const script = document.createElement('script');

    script.dataset.cmsAsset = asset.key;
    script.src = asset.src;
    // Inserted scripts load asynchronously unless told otherwise.
    script.async = asset.attrs.async ?? false;

    if (asset.attrs.module) script.type = 'module';
    if (asset.attrs.integrity) script.integrity = asset.attrs.integrity;
    if (asset.attrs.crossorigin) script.crossOrigin = asset.attrs.crossorigin;

    (asset.placement === 'head' ? document.head : document.body).append(script);
  }
};
