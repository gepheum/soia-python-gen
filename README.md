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

