/**
 * Copyright (c) 2019-present, heineiuo.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { BootBuffer, EntryValueType } from '../BootBuffer'

test('BootBuffer', async done => {
  const bb = new BootBuffer()
  bb.add('foo', 'bar')
  bb.add('int8', 13)
  bb.add('', '')
  bb.add('', '')
  bb.add('', '22')
  bb.add('22', '')
  bb.add('float', 13.2456741)
  bb.add('double', 13.2456741123)
  bb.add('json1', { foo: 'bar' })

  const buf = bb.buffer

  const result = {} as { [x: string]: EntryValueType; json1: { foo: string } }
  for await (const entry of BootBuffer.read(buf)) {
    result[entry.key] = entry.value
  }
  expect(result.foo).toBe('bar')
  expect(result.int8).toBe(13)
  expect(result.float).toBe(13.2456741)
  expect(result.double).toBe(13.2456741123)
  expect(result['22']).toBe('')
  expect(result['']).toBe('22')
  expect(result.json1.foo).toBe('bar')
  done()
})
