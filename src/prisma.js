const SCALARS = new Set([
  "String",
  "Int",
  "Float",
  "Boolean",
  "DateTime",
  "Decimal",
  "Json",
  "Bytes",
  "BigInt"
]);

export function parsePrismaSchema(schemaText) {
  const lines = schemaText.split(/\r?\n/);
  const models = [];
  const enums = new Map();
  const enumNames = new Set();

  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.split("//")[0].trim();
    if (!line) continue;
    const enumMatch = line.match(/^enum\s+(\w+)\s*\{/);
    if (enumMatch) enumNames.add(enumMatch[1]);
  }

  for (const rawLine of lines) {
    const line = rawLine.split("//")[0].trim();
    if (!line) continue;

    if (!current) {
      const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
      if (modelMatch) {
        current = { type: "model", name: modelMatch[1], fields: [] };
        continue;
      }

      const enumMatch = line.match(/^enum\s+(\w+)\s*\{/);
      if (enumMatch) {
        current = { type: "enum", name: enumMatch[1], values: [] };
        continue;
      }

      continue;
    }

    if (line.startsWith("}")) {
      if (current.type === "model") {
        models.push(current);
      } else if (current.type === "enum") {
        enums.set(current.name, current.values);
      }
      current = null;
      continue;
    }

    if (current.type === "enum") {
      const value = line.split(/\s+/)[0];
      if (value) current.values.push(value);
      continue;
    }

    if (current.type === "model") {
      if (line.startsWith("@@")) continue;
      const tokens = line.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) continue;

      const fieldName = tokens[0];
      let typeToken = tokens[1];
      const attributes = tokens.slice(2);

      let isList = false;
      let isOptional = false;

      if (typeToken.endsWith("[]")) {
        isList = true;
        typeToken = typeToken.slice(0, -2);
      } else if (typeToken.endsWith("?")) {
        isOptional = true;
        typeToken = typeToken.slice(0, -1);
      }

      const isScalar = SCALARS.has(typeToken);
      const isEnum = enumNames.has(typeToken);
      const kind = isScalar ? "scalar" : isEnum ? "enum" : "relation";
      const isId = attributes.includes("@id") || fieldName === "id";
      const hasDefault = attributes.some((attr) => attr.startsWith("@default("));

      current.fields.push({
        name: fieldName,
        type: typeToken,
        kind,
        isList,
        isOptional,
        isId,
        hasDefault,
        attributes
      });
    }
  }

  return { models, enums };
}
