import unittest

from soiagen.constants_soia import ONE_CONSTANT
from soiagen.enums_soia import JsonValue, Weekday
from soiagen.full_name_soia import FullName
from soiagen.structs_soia import Color, Foo, Item, Items, Triangle, True_


class SoiagenTestCase(unittest.TestCase):
    def test_full_name(self):
        full_name = FullName(first_name="Tyler", last_name="Fibonacci")
        self.assertEqual(full_name.first_name, "Tyler")
        self.assertEqual(full_name.last_name, "Fibonacci")
        self.assertEqual(
            FullName.SERIALIZER.to_json_code(full_name),
            '["Tyler","Fibonacci"]',
        )

    def test_partial_full_name(self):
        full_name = FullName.partial(first_name="Tyler")
        self.assertEqual(full_name.first_name, "Tyler")
        self.assertEqual(full_name.last_name, "")
        self.assertEqual(
            FullName.SERIALIZER.to_json_code(full_name),
            '["Tyler"]',
        )

    def test_full_name_replace(self):
        full_name = FullName(first_name="Tyler", last_name="Smith")
        full_name = full_name.replace(last_name="Fibonacci")
        self.assertEqual(full_name.first_name, "Tyler")
        self.assertEqual(full_name.last_name, "Fibonacci")

    def test_full_name_mutable(self):
        full_name = FullName.Mutable(first_name="Tyler")
        full_name.last_name = "Fibonacci"
        self.assertEqual(
            FullName.SERIALIZER.to_json_code(full_name.to_frozen()),
            '["Tyler","Fibonacci"]',
        )

    def test_nested_struct(self):
        bar = Foo.Bar.partial(bar="Bar")
        self.assertEqual(bar.foos, None)
        self.assertEqual(bar.bar, "Bar")

    def test_triangle_default(self):
        self.assertEqual(Triangle.DEFAULT.color, Color.DEFAULT)
        self.assertEqual(Triangle.DEFAULT.points, ())

    def test_struct_with_name_conflicts(self):
        t = True_.partial(self=())
        self.assertEqual(t.self, ())

    def test_keyed_arrays(self):
        items = Items.partial(
            array_with_enum_key=[
                Item.partial(
                    weekday=Weekday.MONDAY,
                    bool=True,
                ),
                Item.partial(
                    weekday=Weekday.TUESDAY,
                    bool=True,
                ),
            ]
        )
        self.assertEqual(
            items.array_with_enum_key.find("TUESDAY"),
            Item.partial(
                weekday=Weekday.TUESDAY,
                bool=True,
            ),
        )
        self.assertEqual(
            items.array_with_enum_key.find("WEDNESDAY"),
            None,
        )

    def test_constant(self):
        self.assertEqual(
            ONE_CONSTANT,
            JsonValue.wrap_array(
                [
                    JsonValue.wrap_boolean(True),
                    JsonValue.wrap_number(3.14),
                    JsonValue.wrap_string(
                        "\n".join(
                            [
                                "",
                                "        foo",
                                "        bar",
                            ]
                        )
                    ),
                    JsonValue.wrap_object(
                        [
                            JsonValue.Pair(
                                name="foo",
                                value=JsonValue.NULL,
                            ),
                        ]
                    ),
                ]
            ),
        )

    def test_or_mutable_type_is_defined(self):
        _ = FullName.OrMutable
        del _

    def test_kind_type_is_defined(self):
        _ = JsonValue.Kind
        del _
