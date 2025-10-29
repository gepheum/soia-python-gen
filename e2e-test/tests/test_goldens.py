from dataclasses import dataclass
import json
import unittest
from typing import Any, Generic, TypeVar

import soia
from soiagen.goldens_soia import (
    UNIT_TESTS,
    Assertion,
    BytesExpression,
    Color,
    Point,
    PointExpression,
    StringExpression,
    TypedValue,
)


class AssertionError(Exception):
    def __init__(self, actual=None, expected=None, message=None):
        self.actual = actual
        self.expected = expected
        self._message = message
        super().__init__(message)

    def add_context(self, context: str):
        if self._message:
            self._message = f"{self._message}\n{context}"
        else:
            self._message = context
        self.args = (self._message,)


class GoldensTestCase(unittest.TestCase):
    def test_goldens(self):
        for unit_test in UNIT_TESTS:
            try:
                verify_assertion(unit_test.assertion)
            except AssertionError as e:
                e.add_context(f"While evaluating test #{unit_test.test_number}")
                raise


def verify_assertion(assertion: Assertion):
    if assertion.union.kind == "bytes_equal":
        actual = evaluate_bytes(assertion.union.value.actual).hex()
        expected = evaluate_bytes(assertion.union.value.expected).hex()
        if actual != expected:
            raise AssertionError(
                actual=f"hex:{actual}",
                expected=f"hex:{expected}",
            )
    elif assertion.union.kind == "string_equal":
        actual = evaluate_string(assertion.union.value.actual)
        expected = evaluate_string(assertion.union.value.expected)
        if actual != expected:
            raise AssertionError(
                actual=actual,
                expected=expected,
                message=f"Actual: {json.dumps(actual)}",
            )
    elif assertion.union.kind == "value_bundle":
        return verify_value_bundle(assertion.union.value)
    elif assertion.union.kind == "?":
        raise ValueError("Unknown assertion kind")


def verify_value_bundle(value_bundle: Assertion.ValueBundle):
    typed_values = [
        value_bundle.value,
        TypedValue.wrap_round_trip_dense_json(value_bundle.value),
        TypedValue.wrap_round_trip_readable_json(value_bundle.value),
        TypedValue.wrap_round_trip_bytes(value_bundle.value),
    ]
    for input_value in typed_values:
        try:
            verify_assertion(
                Assertion.create_bytes_equal(
                    actual=BytesExpression.wrap_to_bytes(value_bundle.value),
                    expected=BytesExpression.wrap_literal(value_bundle.expected_bytes),
                )
            )
            verify_assertion(
                Assertion.create_string_equal(
                    actual=StringExpression.wrap_to_dense_json(value_bundle.value),
                    expected=StringExpression.wrap_literal(
                        value_bundle.expected_dense_json
                    ),
                )
            )
            verify_assertion(
                Assertion.create_string_equal(
                    actual=StringExpression.wrap_to_readable_json(value_bundle.value),
                    expected=StringExpression.wrap_literal(
                        value_bundle.expected_readable_json
                    ),
                )
            )
        except AssertionError as e:
            e.add_context(f"input value: {input_value}")
            raise

    typed_value = evaluate_typed_value(value_bundle.value)
    for alternative_json in value_bundle.alternative_jsons:
        try:
            round_trip_json = to_dense_json(
                typed_value.serializer,
                from_json_keep_unrecognized_fields(
                    typed_value.serializer,
                    evaluate_string(alternative_json),
                ),
            )
            verify_assertion(
                Assertion.create_string_equal(
                    actual=StringExpression.wrap_literal(round_trip_json),
                    expected=StringExpression.wrap_literal(
                        value_bundle.expected_dense_json
                    ),
                )
            )
        except AssertionError as e:
            e.add_context(
                f"while processing alternative JSON: {evaluate_string(alternative_json)}"
            )
            raise

    for alternative_bytes in value_bundle.alternative_bytes:
        try:
            round_trip_bytes = to_bytes(
                typed_value.serializer,
                from_bytes_drop_unrecognized(
                    typed_value.serializer,
                    evaluate_bytes(alternative_bytes),
                ),
            )
            verify_assertion(
                Assertion.create_bytes_equal(
                    actual=BytesExpression.wrap_literal(round_trip_bytes),
                    expected=BytesExpression.wrap_literal(value_bundle.expected_bytes),
                )
            )
        except AssertionError as e:
            e.add_context(
                f"while processing alternative bytes: {evaluate_bytes(alternative_bytes).hex()}"
            )
            raise

    if value_bundle.expected_type_descriptor:
        actual = json.dumps(
            typed_value.serializer.type_descriptor.as_json(),
            indent=2,
        )
        verify_assertion(
            Assertion.create_string_equal(
                actual=StringExpression.wrap_literal(actual),
                expected=StringExpression.wrap_literal(
                    value_bundle.expected_type_descriptor
                ),
            )
        )


def evaluate_bytes(expr: BytesExpression) -> bytes:
    if expr.union.kind == "literal":
        return expr.union.value
    elif expr.union.kind == "point_to_bytes":
        return to_bytes(Point.SERIALIZER, evaluate_point(expr.union.value))
    elif expr.union.kind == "to_bytes":
        literal = evaluate_typed_value(expr.union.value)
        return to_bytes(literal.serializer, literal.value)
    elif expr.union.kind == "?":
        raise ValueError("Unknown BytesExpression kind")
    else:
        raise ValueError(f"Unexpected BytesExpression kind: {expr.union.kind}")


def evaluate_string(expr: StringExpression) -> str:
    if expr.union.kind == "literal":
        return expr.union.value
    elif expr.union.kind == "point_to_dense_json":
        return to_dense_json(Point.SERIALIZER, evaluate_point(expr.union.value))
    elif expr.union.kind == "point_to_readable_json":
        return to_readable_json(Point.SERIALIZER, evaluate_point(expr.union.value))
    elif expr.union.kind == "to_dense_json":
        literal = evaluate_typed_value(expr.union.value)
        return to_dense_json(literal.serializer, literal.value)
    elif expr.union.kind == "to_readable_json":
        literal = evaluate_typed_value(expr.union.value)
        return to_readable_json(literal.serializer, literal.value)
    elif expr.union.kind == "?":
        raise ValueError("Unknown StringExpression kind")
    else:
        raise ValueError(f"Unexpected StringExpression kind: {expr.union.kind}")


def evaluate_point(point: PointExpression) -> Point:
    if point.union.kind == "literal":
        return point.union.value
    elif point.union.kind == "from_json_keep_unrecognized":
        return from_json_keep_unrecognized_fields(
            Point.SERIALIZER,
            evaluate_string(point.union.value),
        )
    elif point.union.kind == "from_json_drop_unrecognized":
        return from_json_drop_unrecognized_fields(
            Point.SERIALIZER,
            evaluate_string(point.union.value),
        )
    elif point.union.kind == "from_bytes_keep_unrecognized":
        return from_bytes_keep_unrecognized(
            Point.SERIALIZER,
            evaluate_bytes(point.union.value),
        )
    elif point.union.kind == "from_bytes_drop_unrecognized":
        return from_bytes_drop_unrecognized(
            Point.SERIALIZER,
            evaluate_bytes(point.union.value),
        )
    elif point.union.kind == "?":
        raise ValueError("Unknown PointExpression kind")
    else:
        raise ValueError(f"Unexpected PointExpression kind: {point.union.kind}")


T = TypeVar("T")


@dataclass(frozen=True)
class TypedValueType(Generic[T]):
    value: T
    serializer: soia.Serializer[T]


def evaluate_typed_value(literal: TypedValue) -> TypedValueType[Any]:
    if literal.union.kind == "bool":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("bool"),
        )
    elif literal.union.kind == "int32":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("int32"),
        )
    elif literal.union.kind == "int64":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("int64"),
        )
    elif literal.union.kind == "uint64":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("uint64"),
        )
    elif literal.union.kind == "float32":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("float32"),
        )
    elif literal.union.kind == "float64":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("float64"),
        )
    elif literal.union.kind == "timestamp":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("timestamp"),
        )
    elif literal.union.kind == "string":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("string"),
        )
    elif literal.union.kind == "bytes":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.primitive_serializer("bytes"),
        )
    elif literal.union.kind == "bool_optional":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.optional_serializer(soia.primitive_serializer("bool")),
        )
    elif literal.union.kind == "ints":
        return TypedValueType(
            value=literal.union.value,
            serializer=soia.array_serializer(soia.primitive_serializer("int32")),
        )
    elif literal.union.kind == "point":
        return TypedValueType(
            value=literal.union.value,
            serializer=Point.SERIALIZER,
        )
    elif literal.union.kind == "color":
        return TypedValueType(
            value=literal.union.value,
            serializer=Color.SERIALIZER,
        )
    elif literal.union.kind == "round_trip_dense_json":
        other = evaluate_typed_value(literal.union.value)
        return TypedValueType(
            value=from_json_drop_unrecognized_fields(
                other.serializer,
                to_dense_json(other.serializer, other.value),
            ),
            serializer=other.serializer,
        )
    elif literal.union.kind == "round_trip_readable_json":
        other = evaluate_typed_value(literal.union.value)
        return TypedValueType(
            value=from_json_drop_unrecognized_fields(
                other.serializer,
                to_readable_json(other.serializer, other.value),
            ),
            serializer=other.serializer,
        )
    elif literal.union.kind == "round_trip_bytes":
        other = evaluate_typed_value(literal.union.value)
        return TypedValueType(
            value=from_bytes_drop_unrecognized(
                other.serializer,
                to_bytes(other.serializer, other.value),
            ),
            serializer=other.serializer,
        )
    elif literal.union.kind == "?":
        raise ValueError("Unknown TypedValue kind")
    else:
        raise ValueError(f"Unexpected TypedValue kind: {literal.union.kind}")


def to_dense_json(serializer: soia.Serializer[T], input: T) -> str:
    try:
        return serializer.to_json_code(input)
    except Exception as e:
        raise ValueError(f"Failed to serialize {input} to dense JSON: {e}")


def to_readable_json(serializer: soia.Serializer[T], input: T) -> str:
    try:
        return serializer.to_json_code(input, readable=True)
    except Exception as e:
        raise ValueError(f"Failed to serialize {input} to readable JSON: {e}")


def to_bytes(serializer: soia.Serializer[T], input: T) -> bytes:
    try:
        return serializer.to_bytes(input)
    except Exception as e:
        raise ValueError(f"Failed to serialize {input} to bytes: {e}")


def from_json_keep_unrecognized_fields(
    serializer: soia.Serializer[T], json_code: str
) -> T:
    try:
        return serializer.from_json_code(json_code, keep_unrecognized_fields=True)
    except Exception as e:
        raise ValueError(f"Failed to deserialize {json_code}: {e}")


def from_json_drop_unrecognized_fields(
    serializer: soia.Serializer[T], json_code: str
) -> T:
    try:
        return serializer.from_json_code(json_code)
    except Exception as e:
        raise ValueError(f"Failed to deserialize {json_code}: {e}")


def from_bytes_drop_unrecognized(serializer: soia.Serializer[T], data: bytes) -> T:
    try:
        return serializer.from_bytes(data)
    except Exception as e:
        raise ValueError(f"Failed to deserialize {data.hex()}: {e}")


def from_bytes_keep_unrecognized(serializer: soia.Serializer[T], data: bytes) -> T:
    try:
        return serializer.from_bytes(data, keep_unrecognized_fields=True)
    except Exception as e:
        raise ValueError(f"Failed to deserialize {data.hex()}: {e}")


if __name__ == "__main__":
    unittest.main()
