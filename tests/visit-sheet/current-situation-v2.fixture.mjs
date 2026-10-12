// Isolated acceptance data, never imported by application runtime.
export const situationRaw='早上起来的时候就开始其实有点头晕但不是头疼，发烧也不发烧，然后体温是正常的，但是脖子那里有一个小红点，我估计是痱子，不知道是热疹还是湿疹，然后腿部其实也是有点小疹子。昨天没给他吃太多什么不正常的东西，都是他平时吃的东西，只有牛肉是新添加的。'
export function situationOutput(sourceId='record:focus'){
 const line=(text,quote,emphasis=[])=>({text,quote,sourceId,emphasis})
 return {overview:'今早有点头晕，无头痛，体温正常；颈部和腿部有皮肤观察。',keyPoints:[{text:'有点头晕但无头痛，体温正常',sectionId:'record',quote:situationRaw}],missingInformation:[],currentSituation:{
  description:[line('今早起床后有点头晕，颈部有一个小红点，腿部也有少量小疹子。无头痛，体温正常。',situationRaw,['无头痛','体温正常'])],
  symptoms:[{...line('早上起床后开始，有点头晕。无头痛。','早上起来的时候就开始其实有点头晕但不是头疼',['有点头晕','无头痛']),label:'头晕',kind:'symptom',note:'',noteQuote:''},{...line('颈部有一个小红点。\n腿部有少量小疹子。','脖子那里有一个小红点，我估计是痱子，不知道是热疹还是湿疹，然后腿部其实也是有点小疹子',['颈部','腿部']),label:'皮肤',kind:'symptom',note:'家属怀疑是痱子、热疹或湿疹。',noteQuote:'我估计是痱子，不知道是热疹还是湿疹'},{...line('正常。','体温是正常的'),label:'体温',kind:'temperature',note:'',noteQuote:''}],
  diet:[line('昨日主要吃平时吃过的食物。','都是他平时吃的东西'),line('新添加了牛肉。','只有牛肉是新添加的',['新添加了牛肉'])],changes:[],treatment:[],keywords:[line('头晕','有点头晕'),line('皮疹','有点小疹子')]
 }}
}
