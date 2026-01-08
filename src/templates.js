import { pluralize, toCamelCase, toKebabCase, toLabel, toPascalCase } from "./utils.js";

const NUMBER_TYPES = new Set(["Int", "Float", "Decimal", "BigInt"]);

function isScalarField(field) {
  return (field.kind === "scalar" || field.kind === "enum") && !field.isList;
}

function fieldTsType(field) {
  if (field.kind === "enum") return "string";
  if (NUMBER_TYPES.has(field.type)) return "number";
  if (field.type === "Boolean") return "boolean";
  if (field.type === "Json") return "unknown";
  return "string";
}

function fieldZodType(field, enumValues) {
  if (field.kind === "enum") {
    const options = enumValues.map((value) => `"${value}"`).join(", ");
    return `z.enum([${options}])`;
  }

  if (NUMBER_TYPES.has(field.type)) return "z.coerce.number()";
  if (field.type === "Boolean") return "z.boolean()";
  if (field.type === "Json") return "z.unknown()";
  if (field.type === "DateTime") return "z.string().datetime()";
  return "z.string()";
}

function fieldInputType(field) {
  if (NUMBER_TYPES.has(field.type)) return "number";
  if (field.type === "DateTime") return "datetime-local";
  return "text";
}

function renderFormField(field, enumValues) {
  const label = toLabel(field.name);
  const name = field.name;

  if (field.kind === "enum") {
    const items = enumValues
      .map(
        (value) =>
          `            <SelectItem value=\"${value}\">${toLabel(value)}</SelectItem>`
      )
      .join("\n");

    return {
      block: `      <FormField
        control={form.control}
        name=\"${name}\"
        render={({ field }) => (
          <FormItem>
            <FormLabel>${label}</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder=\"Select ${label}\" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
${items}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />`,
      imports: [
        "Select",
        "SelectContent",
        "SelectItem",
        "SelectTrigger",
        "SelectValue"
      ]
    };
  }

  if (field.type === "Boolean") {
    return {
      block: `      <FormField
        control={form.control}
        name=\"${name}\"
        render={({ field }) => (
          <FormItem className=\"flex items-center gap-2\">
            <FormControl>
              <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className=\"!mt-0\">${label}</FormLabel>
            <FormMessage />
          </FormItem>
        )}
      />`,
      imports: ["Checkbox"]
    };
  }

  if (field.type === "Json") {
    return {
      block: `      <FormField
        control={form.control}
        name=\"${name}\"
        render={({ field }) => (
          <FormItem>
            <FormLabel>${label}</FormLabel>
            <FormControl>
              <Textarea placeholder=\"${label}\" {...field} value={field.value ?? \"\"} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />`,
      imports: ["Textarea"]
    };
  }

  return {
    block: `      <FormField
        control={form.control}
        name=\"${name}\"
        render={({ field }) => (
          <FormItem>
            <FormLabel>${label}</FormLabel>
            <FormControl>
              <Input
                type=\"${fieldInputType(field)}\"
                placeholder=\"${label}\"
                {...field}
                value={field.value ?? \"\"}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />`,
    imports: ["Input"]
  };
}

export function buildTemplates(model, enums) {
  const modelName = model.name;
  const modelPascal = toPascalCase(modelName);
  const modelVar = toCamelCase(modelName);
  const modelSlug = toKebabCase(modelName);
  const collectionSlug = pluralize(modelSlug);
  const modelLabel = toLabel(modelName);
  const modelPluralLabel = toLabel(pluralize(modelName));

  const scalarFields = model.fields.filter(isScalarField);
  const formFields = scalarFields.filter((field) => !field.isId && !field.hasDefault);

  const idField = model.fields.find((field) => field.isId) ||
    model.fields.find((field) => field.name === "id") ||
    scalarFields[0] ||
    { name: "id", type: "String", kind: "scalar" };

  const idTsType = fieldTsType(idField);
  const idPlaceholder = idTsType === "number" ? "0" : `"${modelVar}-id"`;

  const tableHeaders = scalarFields
    .map((field) => `            <TableHead>${toLabel(field.name)}</TableHead>`)
    .join("\n");

  const tableCells = scalarFields
    .map((field) => `            <TableCell>{formatCell(row.${field.name})}</TableCell>`)
    .join("\n");

  const tableKey = idField ? `row.${idField.name}` : "index";

  const tableComponent = `import type { ${modelPascal}Record } from "@/lib/schemacn/${modelVar}.data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

const formatCell = (value) => {
  if (value === null || value === undefined) return "-";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

type ${modelPascal}TableProps = {
  data: ${modelPascal}Record[];
};

export function ${modelPascal}Table({ data }: ${modelPascal}TableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
${tableHeaders}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={${scalarFields.length}} className="text-muted-foreground">
              No ${modelPluralLabel.toLowerCase()} yet.
            </TableCell>
          </TableRow>
        ) : (
          data.map((row, index) => (
            <TableRow key={${tableKey} ?? index}>
${tableCells}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
`;

  const formFieldBlocks = [];
  const formImports = new Set([
    "Form",
    "FormControl",
    "FormField",
    "FormItem",
    "FormLabel",
    "FormMessage"
  ]);
  const componentImports = new Set();

  for (const field of formFields) {
    const enumValues = field.kind === "enum" ? enums.get(field.type) || [] : [];
    const { block, imports } = renderFormField(field, enumValues);
    formFieldBlocks.push(block);
    for (const imp of imports) componentImports.add(imp);
  }

  const formComponent = `"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { ${modelPascal}Input } from "@/lib/schemacn/${modelVar}.schema";
import { ${modelVar}InputSchema } from "@/lib/schemacn/${modelVar}.schema";
import { Button } from "@/components/ui/button";
import {
  ${Array.from(formImports).sort().join(",\n  ")}
} from "@/components/ui/form";
${componentImports.has("Input") ? "import { Input } from \"@/components/ui/input\";\n" : ""}${componentImports.has("Textarea") ? "import { Textarea } from \"@/components/ui/textarea\";\n" : ""}${componentImports.has("Checkbox") ? "import { Checkbox } from \"@/components/ui/checkbox\";\n" : ""}${componentImports.has("Select") ? "import {\n  Select,\n  SelectContent,\n  SelectItem,\n  SelectTrigger,\n  SelectValue\n} from \"@/components/ui/select\";\n" : ""}

type ${modelPascal}FormProps = {
  defaultValues?: Partial<${modelPascal}Input>;
  onSubmit?: (values: ${modelPascal}Input) => Promise<void> | void;
};

export function ${modelPascal}Form({ defaultValues, onSubmit }: ${modelPascal}FormProps) {
  const form = useForm<${modelPascal}Input>({
    resolver: zodResolver(${modelVar}InputSchema),
    defaultValues: defaultValues ?? {}
  });

  const handleSubmit = async (values) => {
    if (onSubmit) {
      await onSubmit(values);
      return;
    }

    console.log("${modelName} submitted", values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
${formFieldBlocks.join("\n\n")}
        <Button type="submit">Save ${modelLabel}</Button>
      </form>
    </Form>
  );
}
`;

  const schemaFields = formFields
    .map((field) => {
      const zodType = fieldZodType(field, enums.get(field.type) || []);
      const optionalSuffix = field.isOptional ? ".optional()" : "";
      return `  ${field.name}: ${zodType}${optionalSuffix}`;
    })
    .join(",\n");

  const schemaFile = `import { z } from "zod";

export const ${modelVar}InputSchema = z.object({
${schemaFields}
});

export type ${modelPascal}Input = z.infer<typeof ${modelVar}InputSchema>;
`;

  const dataFile = `import type { ${modelPascal}Input } from "./${modelVar}.schema";

export type ${modelPascal}Record = ${modelPascal}Input & {
  ${idField.name}: ${idTsType};
};

export async function list${pluralize(modelPascal)}(): Promise<${modelPascal}Record[]> {
  return [];
}

export async function get${modelPascal}ById(id: ${idTsType}): Promise<${modelPascal}Record | null> {
  void id;
  return null;
}

export async function create${modelPascal}(data: ${modelPascal}Input): Promise<${modelPascal}Record> {
  return {
    ${idField.name}: ${idPlaceholder},
    ...data
  } as ${modelPascal}Record;
}

export async function update${modelPascal}(
  id: ${idTsType},
  data: ${modelPascal}Input
): Promise<${modelPascal}Record> {
  return {
    ${idField.name}: id,
    ...data
  } as ${modelPascal}Record;
}

export async function delete${modelPascal}(id: ${idTsType}): Promise<void> {
  void id;
}
`;

  const listPage = `import Link from "next/link";
import { ${modelPascal}Table } from "@/components/schemacn/${modelVar}-table";
import { list${pluralize(modelPascal)} } from "@/lib/schemacn/${modelVar}.data";
import { Button } from "@/components/ui/button";

export default async function ${modelPascal}ListPage() {
  const data = await list${pluralize(modelPascal)}();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">${modelPluralLabel}</h1>
        <Button asChild>
          <Link href="/${collectionSlug}/new">New ${modelLabel}</Link>
        </Button>
      </div>
      <${modelPascal}Table data={data} />
    </div>
  );
}
`;

  const newPage = `import { ${modelPascal}Form } from "@/components/schemacn/${modelVar}-form";

export default function New${modelPascal}Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New ${modelLabel}</h1>
      <${modelPascal}Form />
    </div>
  );
}
`;

  const editPage = `import { ${modelPascal}Form } from "@/components/schemacn/${modelVar}-form";
import { get${modelPascal}ById } from "@/lib/schemacn/${modelVar}.data";

export default async function Edit${modelPascal}Page({
  params
}: {
  params: { id: string };
}) {
  const record = await get${modelPascal}ById(params.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Edit ${modelLabel}</h1>
      <${modelPascal}Form defaultValues={record ?? undefined} />
    </div>
  );
}
`;

  const detailRows = scalarFields
    .map(
      (field) => `        <div className="space-y-1">
          <dt className="text-sm text-muted-foreground">${toLabel(field.name)}</dt>
          <dd className="text-base">{formatValue(record?.${field.name})}</dd>
        </div>`
    )
    .join("\n");

  const detailPage = `import { get${modelPascal}ById } from "@/lib/schemacn/${modelVar}.data";

const formatValue = (value) => {
  if (value === null || value === undefined) return "-";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

export default async function ${modelPascal}DetailPage({
  params
}: {
  params: { id: string };
}) {
  const record = await get${modelPascal}ById(params.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">${modelLabel} details</h1>
      <div className="grid gap-4 md:grid-cols-2">
${detailRows}
      </div>
    </div>
  );
}
`;

  return {
    paths: {
      listPage: `app/${collectionSlug}/page.tsx`,
      newPage: `app/${collectionSlug}/new/page.tsx`,
      editPage: `app/${collectionSlug}/[id]/edit/page.tsx`,
      detailPage: `app/${collectionSlug}/[id]/page.tsx`,
      formComponent: `components/schemacn/${modelVar}-form.tsx`,
      tableComponent: `components/schemacn/${modelVar}-table.tsx`,
      schemaFile: `lib/schemacn/${modelVar}.schema.ts`,
      dataFile: `lib/schemacn/${modelVar}.data.ts`
    },
    content: {
      listPage,
      newPage,
      editPage,
      detailPage,
      formComponent,
      tableComponent,
      schemaFile,
      dataFile
    }
  };
}
