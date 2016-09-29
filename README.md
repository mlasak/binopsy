# `binopsy`

Reimplementation of [keichi/binary-parser](https://github.com/keichi/binary-parser), supporting both streams and serialization.

The API is mainly the same as `binary-parser`'s, with a couple of additions and one removed method.

## Dropped support for `.skip`

Due to undefined behavior, `.skip` is not supported.
As a workaround the `.buffer` method can be used.

## `.stream`

The `.stream` method returns a transform stream that reads incoming data and emits parser results.
The parser instance is looped until the end of the input is reached.

## `.serialize`

As a counterpart to `binary-parser`'s `.parse` method, `.serialize` takes an object and returns a buffer representation of it.
Optionally, an already allowcated buffer can be passed as a second argument.

## `.fixedSizeNest`

`.fixedSizeNest` is a variation of `nest` that ensures the nested parser reads a specific amount of bytes.
Fixed-size nested parsers are the only source of ambiguity remaining while serializing, as missing bytes are simply skipped.
And error is thrown during serialization if the nested parser attempts to write more bytes than the size permits.

## `formatter`s require a `deformatter`

Properties with a specified formatting function need to also provide a `deformatter` function that restores the original value.

## `flatten` option

As a very simple extension, the `flatten` option allows nested parsers to write to the current object.
Its motivation is the aim for a flat output structure after `.choice` calls.

## Bitfields can be (almost) infinitely long

A relaxation from the 32 bit limit of `binary-parser`.
Also, a bug of the original project that leads to the `bit32` method always parsing [a value of `0`](https://github.com/keichi/binary-parser/issues/35) is not present.

__License: MIT__
