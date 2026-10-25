import { expect, test } from 'bun:test';
import { parseHtml } from '@cms/content/parse';
import { gutenbergHtml } from '#api/domain/tools/gutenberg-content';

test('WordPress headings keep every level from h1 to h6', () => {
  const document = parseHtml(
    '<h1 class="wp-block-heading">A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h5>E</h5><h6>F</h6>',
  );
  expect(
    (document.content ?? []).map((node) => [
      node.type,
      (node.attrs as { level?: number } | undefined)?.level,
    ]),
  ).toEqual([1, 2, 3, 4, 5, 6].map((level) => ['heading', level]));
});

test('WXR block attributes preserve code and callouts without decoration', () => {
  const code = 'echo "<hello>"\n\n  exit 0\n';
  const html = `<!-- wp:kevinbatdorf/code-block-pro ${JSON.stringify({ code, language: 'bash', lineNumbers: true, theme: 'dracula' })} --><pre>decoration</pre><!-- /wp:kevinbatdorf/code-block-pro -->
<!-- wp:simple-alerts-for-gutenberg/alert-boxes {"alert_type":"warning","content":"<p>Keep <strong>this</strong></p>"} --><div>decoration</div><!-- /wp:simple-alerts-for-gutenberg/alert-boxes -->`;
  const document = parseHtml(gutenbergHtml(html));
  expect(document.content?.[0]).toMatchObject({
    type: 'codeBlock',
    attrs: { language: 'bash', lineNumbers: true, theme: null },
    content: [{ type: 'text', text: code }],
  });
  expect(document.content?.[1]).toMatchObject({
    type: 'callout',
    attrs: { variant: 'warning' },
  });
  expect(JSON.stringify(document)).not.toContain('decoration');
});

test('unsupported languages use text; unknown and malformed blocks keep HTML', () => {
  expect(
    gutenbergHtml(
      '<!-- wp:kevinbatdorf/code-block-pro {"code":"x","language":"ansi"} --><pre>x</pre><!-- /wp:kevinbatdorf/code-block-pro -->',
    ),
  ).toContain('data-code-language="text"');
  const unknown =
    '<!-- wp:vendor/other {} --><p>Keep</p><!-- /wp:vendor/other -->';
  expect(gutenbergHtml(unknown)).toBe(unknown);
  const malformed =
    '<!-- wp:kevinbatdorf/code-block-pro {bad} --><pre>Keep</pre><!-- /wp:kevinbatdorf/code-block-pro -->';
  expect(gutenbergHtml(malformed)).toBe(malformed);
});

test('encoded code attributes decode once and remain inert code text', () => {
  const code =
    "&lt;&lt;'EOF'\n&amp;&amp; &gt; &quot; &#039; &apos; &nbsp; &#60; &#x3E; &#X1F600;\n&amp;lt; &#38;lt; &lt;script&gt;alert(1)&lt;/script&gt;";
  const html = `<!-- wp:kevinbatdorf/code-block-pro ${JSON.stringify({ code, language: 'bash' }).replaceAll('&', '\\u0026')} --><pre>decoration</pre><!-- /wp:kevinbatdorf/code-block-pro -->`;
  const document = parseHtml(gutenbergHtml(html));
  expect(document.content?.[0]).toMatchObject({
    type: 'codeBlock',
    content: [
      {
        type: 'text',
        text: "<<'EOF'\n&& > \" ' ' \u00a0 < > 😀\n&lt; &lt; <script>alert(1)</script>",
      },
    ],
  });
});

test('callout HTML decodes text once, keeps breaks and sanitizes markup', () => {
  const content =
    '<p>&lt;tag&gt; &amp; &quot; &#039; &apos; &#65; &#x42; &amp;lt;<br>next<script>alert(1)</script></p>';
  const document = parseHtml(
    gutenbergHtml(
      `<!-- wp:simple-alerts-for-gutenberg/alert-boxes ${JSON.stringify({ content, alert_type: 'warning' })} --><div>decoration</div><!-- /wp:simple-alerts-for-gutenberg/alert-boxes -->`,
    ),
  );
  expect(document.content?.[0]).toMatchObject({
    type: 'callout',
    attrs: { variant: 'warning' },
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: "<tag> & \" ' ' A B &lt;" },
          { type: 'hardBreak' },
          { type: 'text', text: 'next' },
        ],
      },
    ],
  });
  expect(JSON.stringify(document)).not.toContain('alert(1)');
});
