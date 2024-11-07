import { ClassName, getClassName } from "./class_speller.js";
import { PyType } from "./py_type.js";
import type { Module, RecordKey, RecordLocation, ResolvedType } from "soiac";

export type TypeFlavor = "frozen" | "maybe-mutable" | "mutable";

/**
 * Transforms a type found in a `.soia` file into a Python type.
 *
 * The flavors are:
 *   · frozen:
 *       The type is deeply immutable. All the fields of a frozen class are also
 *       frozen.
 *   · maybe-mutable:
 *       Type union of the frozen type and the mutable type. All the fields of a
 *       mutable class are maybe-mutable.
 *   · mutable:
 *       A mutable value. Not all types found in `.soia` files support this, e.g.
 *       strings and numbers are always immutable.
 */
export class TypeSpeller {
  constructor(
    readonly recordMap: ReadonlyMap<RecordKey, RecordLocation>,
    private readonly origin: Module,
  ) {}

  getPyType(
    type: ResolvedType,
    flavor: "frozen" | "mutable",
    allRecordsFrozen?: undefined,
  ): PyType;

  getPyType(
    type: ResolvedType,
    flavor: TypeFlavor,
    // Only matters if mode is "maybe-mutable"
    allRecordsFrozen: boolean | undefined,
  ): PyType;

  getPyType(
    type: ResolvedType,
    flavor: TypeFlavor,
    // Only matters if mode is "maybe-mutable"
    allRecordsFrozen: boolean | undefined,
  ): PyType {
    switch (type.kind) {
      case "record": {
        const recordLocation = this.recordMap.get(type.key)!;
        const record = recordLocation.record;
        const className = getClassName(
          recordLocation,
          this.origin,
        ).qualifiedName;
        if (record.recordType === "struct") {
          if (flavor === "frozen" || allRecordsFrozen) {
            return PyType.quote(className);
          } else if (flavor === "maybe-mutable") {
            return PyType.quote(
              allRecordsFrozen ? className : `${className}.OrMutable`,
            );
          } else if (flavor === "mutable") {
            return PyType.quote(`${className}.Mutable`);
          } else {
            const _: never = flavor;
            throw TypeError();
          }
        }
        // An enum.
        if (flavor === "frozen" || flavor === "maybe-mutable") {
          return PyType.quote(className);
        } else if (flavor === "mutable") {
          // Enum types are immutable.
          return PyType.NEVER;
        } else {
          const _: never = flavor;
          throw TypeError();
        }
      }
      case "array": {
        const frozenItemType = this.getPyType(
          type.item,
          "frozen",
          allRecordsFrozen,
        );
        const maybeMutableItemType = this.getPyType(
          type.item,
          "maybe-mutable",
          allRecordsFrozen,
        );
        let tupleType: PyType;
        if (type.key) {
          const keyType = this.getPyType(type.key.keyType, "frozen");
          tupleType = PyType.of(
            `soialib.KeyedItems[${frozenItemType}, ${keyType}]`,
          );
        } else {
          tupleType = PyType.of(`tuple[${frozenItemType}, ...]`);
        }
        const listType = PyType.of(`list[${maybeMutableItemType}]`);
        if (flavor === "frozen") {
          return tupleType;
        } else if (flavor === "maybe-mutable") {
          return PyType.union([tupleType, listType]);
        } else if (flavor === "mutable") {
          return listType;
        } else {
          const _: never = flavor;
          throw TypeError();
        }
      }
      case "optional": {
        const valueType = this.getPyType(type.other, flavor, allRecordsFrozen);
        if (flavor === "mutable") {
          // The generated mutableX() methods cannot return null.
          return valueType;
        }
        return PyType.union([valueType, PyType.NONE]);
      }
      case "primitive": {
        if (flavor === "mutable") {
          // Don't add a mutableX getter to the Mutable class if x is immutable.
          // All primitive types are immutable.
          return PyType.NEVER;
        }
        const { primitive } = type;
        switch (primitive) {
          case "bool":
            return PyType.BOOL;
          case "int32":
          case "int64":
          case "uint64":
            return PyType.INT;
          case "float32":
          case "float64":
            return PyType.FLOAT;
          case "timestamp":
            return PyType.TIMESTAMP;
          case "string":
            return PyType.STR;
          case "bytes":
            return PyType.BYTES;
        }
      }
    }
  }

  getClassName(recordKey: RecordKey): ClassName {
    const record = this.recordMap.get(recordKey)!;
    return getClassName(record, this.origin);
  }
}
