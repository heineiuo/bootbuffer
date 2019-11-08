# BootBuffer

<p>
  <a href="https://github.com/heineiuo/bootbuffer/actions"><img style="max-width:100%" alt="GitHub Actions status" src="https://github.com/heineiuo/bootbuffer/workflows/Node%20CI/badge.svg"></a>
  <a href="https://coveralls.io/github/heineiuo/bootbuffer"><img style="max-width:100%" alt="Coverage status" src="https://coveralls.io/repos/github/heineiuo/bootbuffer/badge.svg"></a>
  <a href="https://www.npmjs.com/package/bootbuffer"><img style="max-width:100%" alt="npm version" src="https://img.shields.io/npm/v/bootbuffer.svg?style=flat"></a>
  <a href="https://gitter.im/heineiuo/bootbuffer?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge"><img style="max-width:100%" alt="Join the chat at https://gitter.im/heineiuo/bootbuffer" src="https://badges.gitter.im/heineiuo/bootbuffer.svg"></a>
</p>


A binary-encoded serialization, for dababase columns, data transfer and others.

## Get Started

```tsx
import { BootBuffer } from 'bootbuffer' // install from npm

const bb = new BootBuffer()
bb.add('foo', 'bar')
bb.add('int8', 13)
bb.add('float', 13.2456741)
bb.add('double', 13.2456741123)
bb.add('json1', { foo: 'bar' })

for await (const entry of BootBuffer.read(bb.buffer)) {
  console.log(entry.key, entry.value)
  // foo, bar
  // int8, 13
  // float, 13.2456741
  // double, 13.2456741123
  // json1, { foo: "bar" }
}
```

## Support types

* `buffer`
* `string`
* `uint8`
* `uint16`
* `uint32`
* `bigint`
* `float`
* `double`
* `boolean`
* `json`

## Format

```
ValueType<varint> | KeyLength<varint> | ValueLength<varint> | Key<Buffer> | Value<Buffer> | ...repeat |
```



## License

[MIT License](./LICENSE)