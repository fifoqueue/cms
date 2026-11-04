import { Errors, invalidInput } from '#api/shared/errors';

export const validateFunctions = (source: string): void => {
  if (Buffer.byteLength(source) > 262144)
    throw invalidInput(Errors.RequestBodyTooLarge);

  try {
    new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  } catch {
    throw invalidInput(Errors.PluginActivateInvalid);
  }
};
