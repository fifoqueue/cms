import { describe, expect, test } from 'bun:test';
import { outgoingEmailSchema, emailFromSchema } from '@cms/sdk/plugin';

describe('email hook boundaries', () => {
  test('accepts alternative content without permitting envelope or MIME overrides', () => {
    const message = {
      to: 'reader@example.com',
      subject: 'Notice',
      text: 'Plain text',
      html: '<p>Plain text</p>',
      replyTo: 'support@example.com',
      headers: { 'X-Priority': '3' },
    };

    expect(outgoingEmailSchema.parse(message)).toEqual(message);

    for (const name of [
      'To',
      'Cc',
      'Bcc',
      'From',
      'Sender',
      'Return-Path',
      'Content-Type',
      'MIME-Version',
      'Received',
    ])
      expect(
        outgoingEmailSchema.safeParse({
          ...message,
          headers: { [name]: 'attacker@example.org' },
        }).success,
      ).toBe(false);

    expect(
      outgoingEmailSchema.safeParse({
        ...message,
        headers: { 'X-Priority': '3\r\nBcc: attacker@example.org' },
      }).success,
    ).toBe(false);
    expect(
      outgoingEmailSchema.safeParse({ ...message, text: undefined }).success,
    ).toBe(false);
  });

  test('rejects sender header injection and oversized names', () => {
    expect(
      emailFromSchema.safeParse({ name: 'Site', address: 'mail@example.com' })
        .success,
    ).toBe(true);
    expect(
      emailFromSchema.safeParse({
        name: 'Site\r\nBcc: attacker@example.org',
        address: 'mail@example.com',
      }).success,
    ).toBe(false);
    expect(
      emailFromSchema.safeParse({
        name: 'x'.repeat(201),
        address: 'mail@example.com',
      }).success,
    ).toBe(false);
  });
});
