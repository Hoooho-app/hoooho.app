import test from 'node:test'
import assert from 'node:assert/strict'
import { ingredientTranslation, foodLabelCopy } from './presentation'
test('original stays primary; same-language, empty and duplicate translations have no subtitle',()=>{
  const rice={original:'大米',chinese:'大米',english:'Rice',sourceLanguage:'zh'}
  const english={original:'Rice',chinese:'大米',english:'Rice',sourceLanguage:'en'}
  assert.equal(ingredientTranslation(rice,'zh'),'')
  assert.equal(ingredientTranslation(rice,'en'),'Rice')
  assert.equal(ingredientTranslation(english,'zh'),'大米')
  assert.equal(ingredientTranslation(english,'en'),'')
  assert.equal(ingredientTranslation({...rice,english:''},'en'),'')
  assert.equal(ingredientTranslation({...english,chinese:'Rice'},'zh'),'')
  assert.equal(foodLabelCopy.zh.stats(12,0),'已识别12项 · 0项已知冲突')
})
