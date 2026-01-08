export function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

export function toCamelCase(value) {
  const cleaned = value.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

export function toPascalCase(value) {
  const camel = toCamelCase(value);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function toLabel(value) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pluralize(value) {
  if (value.endsWith("y") && !/[aeiou]y$/i.test(value)) {
    return value.slice(0, -1) + "ies";
  }
  if (value.endsWith("s") || value.endsWith("x") || value.endsWith("ch") || value.endsWith("sh")) {
    return value + "es";
  }
  return value + "s";
}
