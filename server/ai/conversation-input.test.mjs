import test from 'node:test'
import assert from 'node:assert/strict'
import {hasConversationInput,hasVisibleConversationText} from '../../shared/conversation-input.mjs'
test('empty and invisible-only input is empty, punctuation and short answers are meaningful',()=>{
 for(const value of ['', ' \n\t','\u200b\ufeff\u2060'])assert.equal(hasVisibleConversationText(value),false)
 for(const value of ['？','。','👍','39','疼','0','没有','杭州'])assert.equal(hasVisibleConversationText(value),true)
})
test('image, audio and uploaded assets do not require visible text',()=>{
 for(const key of ['files','voiceFiles','assetIds'])assert.equal(hasConversationInput({text:'\u200b',[key]:['original']}),true)
 assert.equal(hasConversationInput({text:'\u200b',files:[],voiceFiles:[]}),false)
})
