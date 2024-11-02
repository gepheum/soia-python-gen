import { PY_UPPER_CAMEL_KEYWORDS, getClassName } from "./class_speller.js";
import { PyType } from "./py_type.js";
import { TypeSpeller } from "./type_speller.js";
import type {
  CodeGenerator,
  Constant,
  Method,
  Module,
  RecordKey,
  RecordLocation,
  ResolvedType,
} from "soiac";
import { z } from "zod";

const Config = z.object({});

type Config = z.infer<typeof Config>;

class PythonCodeGenerator implements CodeGenerator<Config> {
  readonly id = "python";
  readonly configType = Config;
  readonly version = "1.0.0";

  generateCode(input: CodeGenerator.Input<Config>): CodeGenerator.Output {
    const { recordMap, config } = input;
    const outputFiles: CodeGenerator.OutputFile[] = [];
    for (const module of input.modules) {
      outputFiles.push({
        path: `${module.path.replace(/\.soia$/, "")}.py`,
        code: new PythonModuleCodeGenerator(
          module,
          recordMap,
          config,
        ).generate(),
      });
    }
    return { files: outputFiles };
  }
}

// Generates the code for one Python module.
class PythonModuleCodeGenerator {
  constructor(
    private readonly inModule: Module,
    recordMap: ReadonlyMap<RecordKey, RecordLocation>,
    private readonly config: Config,
  ) {
    this.typeSpeller = new TypeSpeller(recordMap, inModule);
  }

  generate(): string {
    // http://patorjk.com/software/taag/#f=Doom&t=Do%20not%20edit
    this.pushLine("#  ______                        _               _  _  _");
    this.pushLine("#  |  _  \\                      | |             | |(_)| |");
    this.pushLine("#  | | | |  ___    _ __    ___  | |_    ___   __| | _ | |_");
    this.pushLine(
      "#  | | | | / _ \\  | '_ \\  / _ \\ | __|  / _ \\ / _` || || __|",
    );
    this.pushLine(
      "#  | |/ / | (_) | | | | || (_) || |_  |  __/| (_| || || |_ ",
    );
    this.pushLine(
      "#  |___/   \\___/  |_| |_| \\___/  \\__|  \\___| \\__,_||_| \\__|",
    );
    this.pushLine("#");
    this.pushLine("# To install the Soia client library:");
    this.pushLine("#   pip install soia-client");
    this.pushLine();

    this.writeImports();

    this.writeClassesForRecords(
      this.inModule.records.filter(
        // Only retain top-level records.
        // Nested records will be processed from within their ancestors.
        (r: RecordLocation) => r.recordAncestors.length === 1,
      ),
    );

    for (const method of this.inModule.methods) {
      this.writeMethod(method);
    }

    for (const constant of this.inModule.constants) {
      this.writeConstant(constant);
    }

    this.writeInitModuleCall();

    return this.code;
  }

  private writeImports(): void {
    this.pushLine("import typing");
    this.pushLine();
    for (const path of Object.keys(this.inModule.pathToImportedNames)) {
      // We only need to import the modules, no  need to import the actual names.
      // We will refer to the imported symbols using the long notation:
      //    soiagen.path.to.module.Foo
      this.pushLine(
        `import soiagen.${path.replace(/\.soia$/, "").replace("/", ".")}`,
      );
    }
    this.pushLine("import soialib");
    this.pushLine(
      "from soialib import module_initializer as _module_initializer",
    );
    this.pushLine("from soialib import spec as _spec");
  }

  private writeClassesForRecords(
    recordLocations: readonly RecordLocation[],
  ): void {
    const { recordMap } = this.typeSpeller;
    for (const record of recordLocations) {
      const { recordType } = record.record;
      this.pushLine();
      this.pushLine();
      if (recordType === "struct") {
        this.writeClassForStruct(record);
      } else {
        this.writeClassForEnum(record);
      }
      // Write the classes for the records nested in `record`.
      const nestedRecords = record.record.nestedRecords.map(
        (r) => recordMap.get(r.key)!,
      );
      this.writeClassesForRecords(nestedRecords);
      this.dedent();
    }
  }

  private writeClassForStruct(struct: RecordLocation): void {
    const { fields } = struct.record;
    const className = getClassName(struct, this.inModule);
    const { qualifiedName } = className;
    this.pushLine("@typing.final");
    this.pushLine(`class ${className.name}:`);
    this.pushLine("def __init__(");
    this.pushLine(" _self,");
    if (fields.length) {
      this.pushLine(" *,");
    }
    for (const field of fields) {
      const allRecordsFrozen = field.isRecursive;
      const pyType = this.typeSpeller.getPyType(
        field.type!,
        "maybe-mutable",
        allRecordsFrozen,
      );
      const attribute = structFieldToAttr(field.name.text);
      this.pushLine(` ${attribute}: ${pyType} = typing.cast(${pyType}, ...),`);
    }
    this.pushLine("): ...");
    this.pushLine();
    for (const field of struct.record.fields) {
      const attribute = structFieldToAttr(field.name.text);
      const pyType = this.typeSpeller.getPyType(field.type!, "frozen");
      this.pushLine("@property");
      this.pushLine(`def ${attribute}(self) -> ${pyType}: ...`);
    }
    this.pushLine();
    this.pushLine(`def to_frozen(self) -> "${qualifiedName}": ...`);
    this.pushLine(`def to_mutable(self) -> "${qualifiedName}.Mutable": ...`);
    this.pushLine();
    this.pushLine("@typing.final");
    this.pushLine("class Mutable:");
    this.pushLine("def __init__(");
    this.pushLine(" _self,");
    if (fields.length) {
      this.pushLine(" *,");
    }
    for (const field of fields) {
      const allRecordsFrozen = field.isRecursive;
      const pyType = this.typeSpeller.getPyType(
        field.type!,
        "maybe-mutable",
        allRecordsFrozen,
      );
      const attribute = structFieldToAttr(field.name.text);
      this.pushLine(` ${attribute}: ${pyType},`);
    }
    this.pushLine("): ...");
    this.pushLine();
    for (const field of struct.record.fields) {
      const allRecordsFrozen = field.isRecursive;
      const attribute = structFieldToAttr(field.name.text);
      const pyType = this.typeSpeller.getPyType(
        field.type!,
        "maybe-mutable",
        allRecordsFrozen,
      );
      this.pushLine(`${attribute}: ${pyType}`);
    }
    this.pushLine();
    this.pushLine(`def to_frozen(self) -> "${qualifiedName}": ...`);
    this.dedent();
    this.pushLine();
    this.pushLine(
      `OrMutable: typing.TypeAlias = "${qualifiedName} | ${qualifiedName}.Mutable"`,
    );
    this.pushLine();
    this.pushLine(
      `DEFAULT: typing.Final = typing.cast("${qualifiedName}", ...)`,
    );
    this.pushLine(
      `SERIALIZER: typing.Final = typing.cast(soialib.Serializer["${qualifiedName}"], ...)`,
    );
  }

  private writeClassForEnum(record: RecordLocation): void {
    const { typeSpeller } = this;
    const { fields } = record.record;
    const constantFields = fields.filter((f) => !f.type);
    const valueFields = fields.filter((f) => f.type);
    const className = getClassName(record, this.inModule);
    const { qualifiedName } = className;
    this.pushLine("@typing.final");
    this.pushLine(`class ${className.name}:`);
    this.pushLine(
      `UNKNOWN: typing.Final = typing.cast("${qualifiedName}", ...)`,
    );
    for (const constantField of constantFields) {
      const attribute = enumValueFieldToAttr(constantField.name.text);
      this.pushLine(
        `${attribute}: typing.Final = typing.cast("${qualifiedName}", ...)`,
      );
    }
    this.pushLine();
    for (const valueField of valueFields) {
      const name = valueField.name.text;
      const pyType = typeSpeller.getPyType(valueField.type!, "frozen");
      this.pushLine("@staticmethod");
      this.pushLine(
        `def wrap_${name}(value: ${pyType}) -> "${qualifiedName}": ...`,
      );
    }
    this.pushLine();
    this.pushLine("def __init__(self, _: typing.NoReturn): ...");
    if (fields.length === 0) {
      return;
    }
    this.pushLine();
    {
      const kindType = ['typing.Literal["?"]']
        .concat(fields.map((f) => `typing.Literal["${f.name.text}"]`))
        .join(" | ");
      this.pushLine("@property");
      this.pushLine(`def kind(self) -> ${kindType}: ...`);
    }
    {
      const typesInUnion: PyType[] = valueFields.map((f) =>
        typeSpeller.getPyType(f.type!, "frozen"),
      );
      typesInUnion.push(PyType.NONE);
      const valueType = PyType.union(typesInUnion);
      this.pushLine("@property");
      this.pushLine(`def value(self) -> ${valueType}: ...`);
    }
    {
      const getVariantType = (name: string) =>
        PyType.quote(`${qualifiedName}._${name}`);
      const typesInUnion = [getVariantType("Unknown")].concat(
        fields.map((f) => getVariantType(f.name.text)),
      );
      this.pushLine("@property");
      this.pushLine(`def union(self) -> ${PyType.union(typesInUnion)}: ...`);
    }
    this.writeVariantClass("Unknown", PyType.NONE, "?");
    for (const field of fields) {
      const fieldName = field.name.text;
      const valueType = field.type
        ? typeSpeller.getPyType(field.type, "frozen")
        : PyType.NONE;
      this.writeVariantClass(fieldName, valueType);
    }
    this.pushLine();
    this.pushLine(
      `SERIALIZER: typing.Final = typing.cast(soialib.Serializer["${qualifiedName}"], ...)`,
    );
  }

  private writeVariantClass(
    fieldName: string,
    valueType: PyType,
    kind?: string,
  ): void {
    this.pushLine();
    this.pushLine(`class _${fieldName}(typing.Protocol):`);
    this.pushLine("@property");
    this.pushLine(
      `def kind(self) -> typing.Literal["${kind || fieldName}"]: ...`,
    );
    this.pushLine("@property");
    this.pushLine(`def value(self) -> ${valueType}: ...`);
    this.dedent();
  }

  private writeMethod(method: Method): void {
    const { typeSpeller } = this;
    const methodName = method.name.text;
    const varName = PY_UPPER_CAMEL_KEYWORDS.has(methodName)
      ? `${methodName}_`
      : methodName;
    const requestType = typeSpeller.getPyType(method.requestType!, "frozen");
    const responseType = typeSpeller.getPyType(method.responseType!, "frozen");
    const methodType = `soialib.Method[${requestType}, ${responseType}]`;
    this.pushLine();
    this.pushLine(`${varName}: typing.Final = typing.cast(${methodType}, ...)`);
  }

  private writeConstant(constant: Constant): void {
    const { typeSpeller } = this;
    const name = constant.name.text;
    const type = typeSpeller.getPyType(constant.type!, "frozen");
    this.pushLine();
    this.pushLine(`${name}: typing.Final = typing.cast(${type}, ...)`);
  }

  private writeInitModuleCall(): void {
    const { inModule, typeSpeller } = this;
    this.pushLine();
    this.pushLine();
    this.pushLine("_module_initializer.init_module(");
    this.pushLine(" records=(");
    for (const record of inModule.records) {
      const { recordType, removedNumbers } = record.record;
      const className = getClassName(record, inModule);
      const recordQualname = record.recordAncestors
        .map((r) => r.name.text)
        .join(".");
      const recordId = `${inModule.path}:${recordQualname}`;
      if (recordType === "struct") {
        this.pushLine("  _spec.Struct(");
      } else {
        this.pushLine("  _spec.Enum(");
      }
      this.pushLine(`   id="${recordId}",`);
      if (className.name !== record.record.name.text) {
        this.pushLine(`   _class_name="${className.name}",`);
      }
      if (className.qualifiedName !== recordQualname) {
        this.pushLine(`   _class_qualname="${className.qualifiedName}",`);
      }
      if (removedNumbers.length) {
        const removedNumbersStr = removedNumbers
          .map((n) => `${n}, `)
          .join("")
          .trimEnd();
        this.pushLine(`   removed_numbers=(${removedNumbersStr}),`);
      }
      const { fields } = record.record;
      if (recordType === "struct") {
        this.pushLine(`   fields=(`);
        for (const field of fields) {
          const fieldName = field.name.text;
          const fieldType = field.type!;
          const hasMutableGetter =
            typeSpeller.getPyType(fieldType, "frozen") !==
            typeSpeller.getPyType(
              fieldType,
              "maybe-mutable",
              field.isRecursive,
            );
          this.pushLine("    _spec.Field(");
          this.pushLine(`     name="${fieldName}",`);
          this.pushLine(`     number=${field.number},`);
          this.pushLine(`     type=${this.typeToSpec(fieldType)},`);
          if (hasMutableGetter) {
            this.pushLine(`     has_mutable_getter=True,`);
          }
          const attribute = structFieldToAttr(fieldName);
          if (attribute !== fieldName) {
            this.pushLine(`     _attribute=${attribute},`);
          }
          this.pushLine("    ),");
        }
        this.pushLine(`   ),`);
      } else {
        const constantFields = fields.filter((f) => !f.type);
        const valueFields = fields.filter((f) => f.type);
        this.pushLine(`   constant_fields=(`);
        for (const field of constantFields) {
          const fieldName = field.name.text;
          this.pushLine("    _spec.ConstantField(");
          this.pushLine(`     name="${fieldName}",`);
          this.pushLine(`     number=${field.number},`);
          const attribute = enumValueFieldToAttr(fieldName);
          if (attribute !== fieldName) {
            this.pushLine(`     _attribute="${attribute}",`);
          }
          this.pushLine("    ),");
        }
        this.pushLine(`   ),`);
        this.pushLine(`   value_fields=(`);
        for (const field of valueFields) {
          this.pushLine("    _spec.ValueField(");
          this.pushLine(`     name="${field.name.text}",`);
          this.pushLine(`     number=${field.number},`);
          this.pushLine(`     type=${this.typeToSpec(field.type!)},`);
          this.pushLine("    ),");
        }
        this.pushLine(`   ),`);
      }
      this.pushLine("  ),");
    }
    this.pushLine(" ),");
    this.pushLine(" methods=(");
    for (const method of inModule.methods) {
      const methodName = method.name.text;
      this.pushLine("  _spec.Method(");
      this.pushLine(`   name="${methodName}",`);
      this.pushLine(`   number=${method.number},`);
      this.pushLine(`   request_type=${this.typeToSpec(method.requestType!)},`);
      this.pushLine(
        `   response_type=${this.typeToSpec(method.responseType!)},`,
      );
      if (PY_UPPER_CAMEL_KEYWORDS.has(methodName)) {
        this.pushLine(`   _var_name="${methodName}_",`);
      }
      this.pushLine("  ),");
    }
    this.pushLine(" ),");
    this.pushLine(" constants=(");
    this.pushLine(" ),");
    this.pushLine(" globals=globals(),");
    this.pushLine(")");
  }

  private typeToSpec(type: ResolvedType): string {
    switch (type.kind) {
      case "array": {
        const itemSpec = this.typeToSpec(type.item);
        // TODO: add key_attributes
        return `_spec.ArrayType(${itemSpec})`;
      }
      case "optional": {
        const otherSpec = this.typeToSpec(type.other);
        return `_spec.OptionalType(${otherSpec})`;
      }
      case "primitive":
        return `_spec.PrimitiveType.${type.primitive.toUpperCase()}`;
      case "record": {
        const record = this.typeSpeller.recordMap.get(type.key)!;
        const { recordAncestors, modulePath } = record;
        const recordQualname = recordAncestors
          .map((r) => r.name.text)
          .join(".");
        return `"${modulePath}:${recordQualname}"`;
      }
    }
  }

  private pushLine(code = ""): void {
    if (code === "") {
      // An empty line.
      if (/\n\n$|\:\n$/.test(this.code) && this.indent != "") {
        // Outside of the top level, coelesce empty lines.
        return;
      }
      this.code += "\n";
      return;
    }
    if (code.startsWith(" ")) {
      // Transform every leading space into 4 spaces.
      const numSpaces = code.length - code.trimStart().length;
      code = " ".repeat(3 * numSpaces) + code;
    }
    this.code += `${this.indent}${code}\n`;
    if (code.endsWith(":") && !code.startsWith("#")) {
      this.indent += "    ";
    }
  }

  private dedent(): void {
    this.indent = this.indent.substring(0, this.indent.length - 4);
  }

  private readonly typeSpeller: TypeSpeller;
  private code = "";
  private indent = "";
}

export const GENERATOR = new PythonCodeGenerator();

function structFieldToAttr(fieldName: string): string {
  return PY_LOWER_CASE_KEYWORDS.has(fieldName) ||
    STRUCT_GEN_LOWER_SYMBOLS.has(fieldName) ||
    fieldName.startsWith("mutable_")
    ? `${fieldName}_`
    : fieldName;
}

function enumValueFieldToAttr(fieldName: string): string {
  return STRUCT_GEN_UPPER_SYMBOLS.has(fieldName) ? `${fieldName}_` : fieldName;
}

/** Python keywords in lower_case format. */
const PY_LOWER_CASE_KEYWORDS: ReadonlySet<string> = new Set<string>([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "import",
  "if",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

/** Name of lower_case formatted symbols generated in the Python class for a struct. */
const STRUCT_GEN_LOWER_SYMBOLS: ReadonlySet<string> = new Set<string>([
  "to_frozen",
  "to_mutable",
]);

/** Name of UPPER_CASE formatted symbols generated in the Python class for an enum. */
const STRUCT_GEN_UPPER_SYMBOLS: ReadonlySet<string> = new Set<string>([
  "SERIALIZER",
  "UNKNOWN",
]);
