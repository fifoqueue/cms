/** Form field name of a plugin mail transport's declared field; one per transport and key. */
export const pluginFieldName = (transport: string, key: string) =>
  `plugin.${transport}.${key}`;
