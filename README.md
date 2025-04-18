# Soia's Python code generator

Official plugin for generating Python code from [.soia](https://github.com/gepheum/soia) files.

## Installation

From your project's root directory, run `npm i --save-dev soia-python-gen`.

In your `soia.yml` file, add the following snippet under `generators`:
```yaml
  - mod: soia-python-gen
    config: {}
```

The `npm run soiac` command will now generate .py files within the `soiagen` directory.

For more information, see this Python project [example](https://github.com/gepheum/soia-python-example).

## Python generated code guide

The examples below are for the code generated from [this](https://github.com/gepheum/soia-python-example/blob/main/soia_src/user.soia) .soia file.

### Referring to generated symbols

```python
# Import the given symbols from the Python module generated from "user.soia"
from soiagen.user import TARZAN, User, UserHistory, UserRegistry
```

### Struct classes

For every struct `S` in the .soia file, soia generates a frozen/deeply immutable class `S` and a mutable class `S.Mutable`.

#### Frozen struct classes

```python
# For every struct S in the .soia file, soia generates a frozen/deeply immutable
# class 'S' and a mutable class 'S.Mutable'.

# Consruct a frozen/deeply immutable User
john = User(
    user_id=42,
    name="John Doe",
)

assert john.name == "John Doe"
assert john.user_id == 42
# Fields not specified in the constructor are set to their default values
assert john.pets == ()

# Static type checkers will raise an error if you try to modify a frozen struct:
# john.name = "John Smith"

jane = User(
    user_id=43,
    name="Jane Doe",
    quote="I am Jane.",
    pets=[User.Pet(name="Fluffy"), User.Pet(name="Fido")],
    subscription_status=User.SubscriptionStatus.PREMIUM,
)

# The list passed to the constructor is copied into a tuple to guarantee deep
# immutability.
assert isinstance(jane.pets, tuple)

assert User.DEFAULT == User()
```

#### Converting between frozen and mutable

```python
# to_mutable() does a shallow copy of the frozen struct, so it's cheap. All the
# properties of the copy hold a frozen value.
evil_jane_mut = jane.to_mutable()
evil_jane_mut.name = "Evil Jane"

# to_frozen() recursively copies the mutable values held by properties of the
# object. It's cheap if all the values are frozen, like in this example.
evil_jane: User = evil_jane_mut.to_frozen()
```

#### Writing logic agnostic of mutability

```python
# 'User.OrMutable' is a type alias for 'User | User.Mutable'.
def greet(user: User.OrMutable):
    print(f"Hello, ${user.name}")


greet(jane)
# Hello, Jane Doe
greet(lyla_mut)
# Hello, Lyla Doe
```

### Enum classes

The definition of the `SubscriptionStatus` enum in the .soia file is:
```rust
enum SubscriptionStatus {
  FREE;
  trial: Trial;
  PREMIUM;
}
```

#### Making enum values

```python
john_status = User.SubscriptionStatus.FREE
jane_status = User.SubscriptionStatus.PREMIUM

joly_status = User.SubscriptionStatus.UNKNOWN

# Use wrap_*() for data variants.
roni_status = User.SubscriptionStatus.wrap_trial(
    User.Trial(start_time=soia.Timestamp.from_unix_millis(1744974198000))
)
```

#### Conditions on enums

```python
# Use e.kind == "CONSTANT_NAME" to check if the enum value is a constant.
assert john_status.kind == "FREE"
assert john_status.value is None

# Static type checkers will complain: "RED" not in the enum definition.
# assert jane_status.kind == "RED"

# Use "?" for UNKNOWN.
assert joly_status.kind == "?"

assert roni_status.kind == "trial"
assert isinstance(roni_status.value, User.Trial)


def get_subscription_info_text(status: User.SubscriptionStatus) -> str:
    # Use the union() getter for typesafe switches on enums.
    if status.union.kind == "?":
        return "Unknown subscription status"
    elif status.union.kind == "FREE":
        return "Free user"
    elif status.union.kind == "trial":
        # Here the compiler knows that the type of union.value is 'User.Trial'
        trial: User.Trial = status.union.value
        return f"On trial since {trial.start_time}"
    elif status.union.kind == "PREMIUM":
        return "Premium user"

    # Static type checkers will complain here if you missed a case.
    _: Never = status.union.kind
    raise AssertionError("Unreachable code")
```

### Serialization

Every frozen struct class and enum class has a static readonly `SERIALIZER` property which can be used for serializing and deserializing instances of the class.

```python
# Serialize 'john' to dense JSON.

serializer = User.SERIALIZER

print(serializer.to_json(john))
# [42, 'John Doe']

assert isinstance(serializer.to_json(john), list)

# to_json_code() returns a string containing the JSON code.
# Same as calling json.dumps() on the result of to_json()
print(serializer.to_json_code(john))
# [42,"John Doe"]

# Serialize 'john' to readable JSON.
print(serializer.to_json_code(john, readable=True))
# {
#   "user_id": 42,
#   "name": "John Doe"
# }

# The dense JSON flavor is the flavor you should pick if you intend to
# deserialize the value in the future. Soia allows fields to be renamed, and
# because fields names are not part of the dense JSON, renaming a field does
# not prevent you from deserializing the value.
# You should pick the readable flavor mostly for debugging purposes.
```

### Deserialization

```python
# Use from_json() and from_json_code() to deserialize.

assert john == serializer.from_json(serializer.to_json(john))

assert john == serializer.from_json_code(serializer.to_json_code(john))

# Also works with readable JSON.
assert john == serializer.from_json_code(  #
    serializer.to_json_code(john, readable=True)
)
```

### Keyed arrays

```python
user_registry = UserRegistry(users=[john, jane, lyla_mut])

# 'user_registry.users' is an instance of a subclass of tuple[User, ...] which
# has methods for finding items by key.

assert user_registry.users.find(42) == john
assert user_registry.users.find(100) is None

assert user_registry.users.find_or_default(42).name == "John Doe"
assert user_registry.users.find_or_default(100).name == ""

# find() and find_or_default() run in O(1) time.
```

### Constants

```python
print(TARZAN)
# User(
#   user_id=123,
#   name='Tarzan',
#   quote='AAAAaAaAaAyAAAAaAaAaAyAAAAaAaAaA',
#   pets=[
#     User.Pet(
#       name='Cheeta',
#       height_in_meters=1.67,
#       picture='🐒',
#     ),
#   ],
#   subscription_status=User.SubscriptionStatus.wrap_trial(
#     User.Trial(
#       start_time=Timestamp(
#         unix_millis=1743592409000,
#         _formatted='2025-04-02T11:13:29Z',
#       ),
#     )
#   ),
# )
```

### Soia services

#### Starting a soia service on an HTTP server

Full example [here](https://github.com/gepheum/soia-python-example/blob/main/start_service.py).

#### Sending RPCs to a soia service

Full example [here](https://github.com/gepheum/soia-python-example/blob/main/call_service.py).

### Reflection

Reflection allows you to inspect a soia type at runtime.

```python
field_names: list[str] = []

user_type_descriptor = User.SERIALIZER.type_descriptor

# 'user_type_descriptor' has information about User and all the types it
# depends on.

print(user_type_descriptor.as_json_code())
# {
#   "type": {
#     "kind": "record",
#     "value": "user.soia:User"
#   },
#   "records": [
#     {
#       "kind": "struct",
#       "id": "user.soia:User",
#       "fields": [
#         {
#           "name": "user_id",
#           "type": {
#             "kind": "primitive",
#             "value": "int64"
#           },
#           "number": 0
#         },
#          ...
#         {
#           "name": "pets",
#           "type": {
#             "kind": "array",
#             "value": {
#               "item": {
#                 "kind": "record",
#                 "value": "user.soia:User.Pet"
#               }
#             }
#           },
#           "number": 3
#         },
#         ...
#       ]
#     },
#     {
#       "kind": "struct",
#       "id": "user.soia:User.Pet",
#       ...
#     },
#     ...
#   ]
# }

# A TypeDescriptor can be serialized and deserialized.
assert user_type_descriptor == soia.reflection.TypeDescriptor.from_json_code(
    user_type_descriptor.as_json_code()
)
```
