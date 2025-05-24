import unittest

from soiagen.constants import ONE_CONSTANT
from soiagen.enums import JsonValue, Weekday
from soiagen.full_name import FullName
from soiagen.structs import Color, Foo, Item, Items, Triangle, True_


class SoiagenTestCase(unittest.TestCase):
    def test_full_name(self):
        full_name = FullName(first_name="Tyler", last_name="Fibonacci")
        self.assertEqual(full_name.first_name, "Tyler")
        self.assertEqual(full_name.last_name, "Fibonacci")
        self.assertEqual(
            FullName.SERIALIZER.to_json_code(full_name),
            '["Tyler","Fibonacci"]',
        )

    def test_whole_full_name(self):
        full_name = FullName.whole(first_name="Tyler", last_name="Fibonacci")
        self.assertEqual(full_name.first_name, "Tyler")
        self.assertEqual(full_name.last_name, "Fibonacci")
        self.assertEqual(
            FullName.SERIALIZER.to_json_code(full_name),
            '["Tyler","Fibonacci"]',
        )

    def test_full_name_mutable(self):
        full_name = FullName.Mutable(first_name="Tyler")
        full_name.last_name = "Fibonacci"
        self.assertEqual(
            FullName.SERIALIZER.to_json_code(full_name.to_frozen()),
            '["Tyler","Fibonacci"]',
        )

    def test_nested_struct(self):
        bar = Foo.Bar(bar="Bar")
        self.assertEqual(bar.foos, None)
        self.assertEqual(bar.bar, "Bar")

    def test_triangle_default(self):
        self.assertEqual(Triangle.DEFAULT.color, Color.DEFAULT)
        self.assertEqual(Triangle.DEFAULT.points, ())

    def test_struct_with_name_conflicts(self):
        t = True_(self=())
        self.assertEqual(t.self, ())

    def test_keyed_arrays(self):
        items = Items(
            array_with_enum_key=[
                Item(
                    weekday=Weekday.MONDAY,
                    bool=True,
                ),
                Item(
                    weekday=Weekday.TUESDAY,
                    bool=True,
                ),
            ]
        )
        self.assertEqual(
            items.array_with_enum_key.find("TUESDAY"),
            Item(
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
