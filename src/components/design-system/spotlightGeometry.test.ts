import test from 'node:test'
import assert from 'node:assert/strict'
import { spotlightLayout, spotlightPath } from './spotlightGeometry'
test('guide fits the visible viewport and never covers a highlighted control when space is available', () => {
  for (const width of [320,375,390,430]) {
    for (const top of [70,280,630]) {
      const view = { left:0, top:0, width, height:844 }, target = { left:20, top, width:width-40, height:60 }
      const layout = spotlightLayout([target], view, 170)
      assert.equal(layout.fits, true)
      assert.ok(layout.panel.left >= 0 && layout.panel.left + layout.panel.width <= width)
      assert.ok(layout.panel.top + layout.panel.height <= 844)
      for (const hole of layout.holes) assert.ok(layout.panel.top + layout.panel.height <= hole.top || layout.panel.top >= hole.top + hole.height)
    }
  }
})
test('overlapping holes are merged and missing/offscreen controls do not create blocking holes', () => {
  const view = { left:0,top:200,width:320,height:300 }
  const result = spotlightLayout([{left:12,top:220,width:100,height:30},{left:20,top:220,width:120,height:40},{left:12,top:10,width:100,height:30}],view,100)
  assert.equal(result.holes.length,1)
  assert.ok(result.holes[0].top >= 200)
  assert.equal((spotlightPath(320,844,result.holes).match(/M/g) ?? []).length,2)
  assert.equal(spotlightLayout([],view,100).holes.length,0)
  assert.equal(spotlightLayout([{left:0,top:200,width:320,height:300}],view,100).fits,false)
})
