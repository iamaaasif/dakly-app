import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'prettier';

const root = resolve(import.meta.dirname, '..');
const metadataDirectory = resolve(root, 'packages/db/migrations/meta');
const snapshotName = readdirSync(metadataDirectory)
  .filter((name) => /^\d+_snapshot\.json$/.test(name))
  .sort()
  .at(-1);
const snapshot = JSON.parse(readFileSync(resolve(metadataDirectory, snapshotName), 'utf8'));
const tables = Object.values(snapshot.tables);
const byName = new Map(tables.map((table) => [table.name, table]));
const groups = [
  ['Stores, accounts and team', ['stores', 'auth', 'team', 'admin']],
  [
    'Channels, customers and chats',
    ['areas', 'channels', 'contacts', 'contact-memory', 'customer-insights', 'chats', 'customers'],
  ],
  ['Products, orders and payments', ['products', 'orders', 'payments']],
  ['AI', ['ai']],
  ['Content, campaigns and automations', ['social', 'campaigns', 'automations']],
  ['Billing', ['billing']],
  ['Platform and reporting', ['platform', 'data-requests', 'analytics', 'tasks']],
];

function primaryColumns(table) {
  return [
    ...Object.values(table.columns)
      .filter((column) => column.primaryKey)
      .map((column) => column.name),
    ...Object.values(table.compositePrimaryKeys).flatMap((key) => key.columns),
  ];
}

function uniqueKeys(table) {
  return [
    primaryColumns(table),
    ...Object.values(table.uniqueConstraints).map((key) => key.columns),
    ...Object.values(table.indexes)
      .filter(
        (index) =>
          index.isUnique && !index.where && index.columns.every((column) => !column.isExpression),
      )
      .map((index) => index.columns.map((column) => column.expression)),
  ].filter((columns) => columns.length);
}

function sourceIsUnique(table, columns) {
  if (uniqueKeys(table).some((key) => key.every((column) => columns.includes(column)))) return true;
  // A non-null FK link satisfies these partial predicates; null rows do not link a parent.
  return Object.values(table.indexes).some(
    (index) =>
      index.isUnique &&
      index.where &&
      index.columns.every(
        (column) => !column.isExpression && columns.includes(column.expression),
      ) &&
      columns.some((column) => index.where === `"${table.name}"."${column}" is not null`),
  );
}

function relation(table, foreignKey) {
  const parent = byName.get(foreignKey.tableTo);
  if (
    !parent ||
    foreignKey.columnsTo.some((column) => !parent.columns[column]) ||
    foreignKey.columnsFrom.some((column) => !table.columns[column])
  ) {
    throw new Error(`Foreign key ${foreignKey.name} references a missing table or column`);
  }
  const required = foreignKey.columnsFrom.every((column) => table.columns[column].notNull);
  const identifying = foreignKey.columnsFrom.every((column) =>
    primaryColumns(table).includes(column),
  );
  return `    ${parent.name} ${required ? '||' : '|o'}${identifying ? '--' : '..'}${sourceIsUnique(table, foreignKey.columnsFrom) ? 'o|' : 'o{'} ${table.name} : "${foreignKey.columnsFrom.join(', ')}"`;
}

function columnLine(table, column) {
  const keys = [];
  if (primaryColumns(table).includes(column.name)) keys.push('PK');
  if (Object.values(table.foreignKeys).some((key) => key.columnsFrom.includes(column.name)))
    keys.push('FK');
  if (
    uniqueKeys(table).some((key) => key.length === 1 && key[0] === column.name) &&
    !column.primaryKey
  )
    keys.push('UK');
  const type = column.type.replaceAll(/[^a-zA-Z0-9_]/g, '_');
  return `        ${type} ${column.name}${keys.length ? ` ${keys.join(',')}` : ''} "${column.notNull ? 'NOT NULL' : 'NULL'}; ${column.type.replaceAll('"', "'")}"`;
}

const seen = new Set();
const diagrams = groups.map(([title, files]) => {
  const names = files.flatMap((file) => {
    const source = readFileSync(resolve(root, `packages/db/src/schema/${file}.ts`), 'utf8');
    return [...source.matchAll(/pgTable\(\s*'([^']+)'/g)].map((match) => match[1]);
  });
  const ownedTables = names.map((name) => {
    if (!byName.has(name) || seen.has(name)) throw new Error(`Missing or repeated table ${name}`);
    seen.add(name);
    return byName.get(name);
  });
  const edges = ownedTables.flatMap((table) =>
    Object.values(table.foreignKeys).map((key) => relation(table, key)),
  );
  const entities = ownedTables.map(
    (table) =>
      `    ${table.name} {\n${Object.values(table.columns)
        .map((column) => columnLine(table, column))
        .join('\n')}\n    }`,
  );
  return `## ${title}\n\nSchema files: ${files.map((file) => `\`${file}.ts\``).join(', ')}.\n\n\`\`\`mermaid\nerDiagram\n${[...edges, ...entities].join('\n')}\n\`\`\`\n`;
});
if (seen.size !== tables.length)
  throw new Error(
    `Unmapped tables: ${tables
      .filter((table) => !seen.has(table.name))
      .map((table) => table.name)
      .join(', ')}`,
  );

const foreignKeys = tables.flatMap((table) => Object.values(table.foreignKeys));
const columnsCount = tables.reduce((count, table) => count + Object.keys(table.columns).length, 0);
const indexesCount = tables.reduce((count, table) => count + Object.keys(table.indexes).length, 0);
const registry = foreignKeys.map(
  (key) =>
    `| \`${key.name}\` | \`${key.tableFrom}(${key.columnsFrom.join(', ')})\` | \`${key.tableTo}(${key.columnsTo.join(', ')})\` | ${key.onDelete} |`,
);
const markdown = `# ER diagram

Built from \`packages/db/migrations/meta/${snapshotName}\`: **${tables.length} tables, ${columnsCount} columns, ${indexesCount} explicit indexes and ${foreignKeys.length} foreign keys**. This includes the transitional \`customers\` example; CUS-1 removes it after migration to \`contacts\`.

Regenerate with \`node scripts/generate-er-diagram.mjs\`; verify with \`node scripts/generate-er-diagram.mjs --check\`.

Every column appears once in its owning area's diagram. Every foreign key is drawn in its child table's area, including store ownership, actor links and composite tenant constraints. External tables appear there as reference nodes; their columns are in their own area. Separate single-column and composite constraints can connect the same two tables and are intentionally both shown. Logical references without a foreign key, such as a retained memory checkpoint or a polymorphic source id, are not drawn as database constraints.

Parent cardinality follows nullability of the referring columns: \`||\` means one required parent; \`|o\` means zero or one. Children are zero or many (\`o{\`) unless the referring columns contain a primary or unique key, in which case they are zero or one (\`o|\`). A partial unique index proves this only when its predicate is the linked column being non-null. Solid lines identify references wholly within the child's primary key; other references use dotted lines. PK and FK markers cover composite keys; UK marks an unconditional single-column unique key. Column comments give SQL nullability and exact type. Checks may further restrict valid states beyond these structural cardinalities.

The schema defines relationships, not completed feature behavior. Refer to [review fixes](review-fixes.md) for implementation acceptance checks and [isolation and access](isolation-and-access.md) for grants and tenant rules.

${diagrams.join('\n')}
## Foreign-key registry

Delete actions below are the snapshot declarations. The SQL migration is authoritative for triggers, grants and constraint changes outside Drizzle, including safe detach behavior on nullable references.

| Constraint | Child columns | Parent columns | On delete |
| --- | --- | --- | --- |
${registry.join('\n')}
`;
const result = await format(markdown, { parser: 'markdown' });
const outputPath = resolve(root, 'docs/data/er-diagram.md');
if (process.argv.includes('--check')) {
  if (readFileSync(outputPath, 'utf8') !== result)
    throw new Error('ER diagram is stale; regenerate it');
} else {
  writeFileSync(outputPath, result);
}
console.log(
  `ER diagram: ${tables.length} tables, ${columnsCount} columns, ${foreignKeys.length} foreign keys`,
);
