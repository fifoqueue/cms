export interface FunctionsEditor {
  read(): Promise<{ source: string }>;
  validate(input: unknown): Promise<{ valid: true }>;
  write(input: unknown, actor: string): Promise<unknown>;
  status(): Promise<unknown>;
}
