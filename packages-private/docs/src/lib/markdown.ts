export interface ApiDocProperty {
  property: string;
  type: string;
  defaultValue: string;
  description: string;
}

export interface FormatEffectDocMarkdownOptions {
  title: string;
  description: string;
  installCmd: string;
  usageCode: string;
  apiProperties: readonly ApiDocProperty[];
  isZh: boolean;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function formatEffectDocMarkdown({
  title,
  description,
  installCmd,
  usageCode,
  apiProperties,
  isZh,
}: FormatEffectDocMarkdownOptions): string {
  const installHeading = isZh ? '安装' : 'Install';
  const usageHeading = isZh ? '用法' : 'Usage';
  const apiHeading = isZh ? 'API 参考' : 'API Reference';
  const colProp = isZh ? '属性' : 'Property';
  const colType = isZh ? '类型' : 'Type';
  const colDefault = isZh ? '默认值' : 'Default';
  const colDesc = isZh ? '说明' : 'Description';

  const apiRows = apiProperties
    .map(
      (item) =>
        `| \`${escapeCell(item.property)}\` | \`${escapeCell(item.type)}\` | \`${escapeCell(item.defaultValue)}\` | ${escapeCell(item.description)} |`,
    )
    .join('\n');

  return [
    `# ${title}`,
    '',
    description,
    '',
    `## ${installHeading}`,
    '```bash',
    installCmd,
    '```',
    '',
    `## ${usageHeading}`,
    '```ts',
    usageCode,
    '```',
    '',
    `## ${apiHeading}`,
    '',
    `| ${colProp} | ${colType} | ${colDefault} | ${colDesc} |`,
    '| --- | --- | --- | --- |',
    apiRows,
  ].join('\n');
}
