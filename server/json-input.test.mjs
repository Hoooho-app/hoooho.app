import assert from 'node:assert/strict'
import test from 'node:test'
import { parseJsonObject } from './json-input.mjs'

test('invalid JSON and valid JSON with wrong root type produce client errors', () => {
  for (const value of ['null', '[]', 'true', '42', '"text"']) assert.throws(() => parseJsonObject(value), error => error.status === 400 && error.code === 'INVALID_JSON_BODY')
  assert.throws(() => parseJsonObject('{"nickname":'), error => error.status === 400 && error.code === 'INVALID_JSON')
  assert.deepEqual(parseJsonObject(''), {})
  assert.deepEqual(parseJsonObject('{"items":[null],"name":"😀<>&"}'), { items: [null], name: '😀<>&' })
})
