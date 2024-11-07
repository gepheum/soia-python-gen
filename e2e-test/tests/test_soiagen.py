import unittest

from soiagen.full_name import FullName
from soiagen.structs import Color, Foo, Triangle, True_


class SoiagenTestCase(unittest.TestCase):
    def test_full_name(self):
        full_name = FullName(first_name="Tyler", last_name="Fibonacci")
        self.assertEqual(full_name.first_name, "Tyler")
        self.assertEqual(full_name.last_name, "Fibonacci")
        self.assertEqual(
            FullName.SERIALIZER.to_json_code(full_name),
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
