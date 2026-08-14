import assert from 'node:assert/strict'
import test from 'node:test'
import { profileSectionExperiences } from './profileSectionExperiences.ts'

const frozen = ['basic', 'medication', 'allergy', 'chronic', 'surgery']

test('all 21 non-specialized sections have a dedicated interaction definition', () => {
  assert.equal(profileSectionExperiences.length, 21)
  assert.equal(new Set(profileSectionExperiences.map(({ id }) => id)).size, 21)
  assert.equal(profileSectionExperiences.some(({ id }) => frozen.includes(id)), false)
})

test('current-state profiles and repeatable histories keep distinct save semantics', () => {
  const current = ['sleep', 'diet', 'exercise', 'smoking', 'alcohol', 'mental', 'vision-hearing', 'oral', 'birth', 'feeding', 'menstrual', 'mobility']
  const histories = ['hospitalization', 'transfusion', 'examination', 'vaccination', 'family-history', 'exposure', 'growth', 'pregnancy', 'fall']
  assert.equal(profileSectionExperiences.filter(({ id, repeatable }) => current.includes(id) && repeatable).length, 0)
  assert.equal(profileSectionExperiences.filter(({ id, repeatable }) => histories.includes(id) && !repeatable).length, 0)
})

test('every section has field content and grouped domains', () => {
  for (const definition of profileSectionExperiences) {
    assert.ok(definition.fields.length > 0, `${definition.id} should contain fields`)
    assert.ok(definition.fields.every(({ group }) => Boolean(group)), `${definition.id} fields should have a readable group`)
  }
})
