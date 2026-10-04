export const foodLabelCopy = {
  zh: { entry: '配料表扫描', result: '核对结果', camera: '拍摄配料表', album: '从相册选择', supplement: '补拍食品标签', photo: '本次标签照片', loading: '正在核对成分', all: '全部成分', known: '已知冲突', retake: '重新拍摄', empty: '未识别到成分', readFailure: '部分照片识别失败', translationFailure: '翻译失败，已保留包装原文', stats: (n:number, k:number)=>`已识别${n}项 · ${k}项已知冲突` },
  en: { entry: 'Ingredient scan', result: 'Scan results', camera: 'Photograph ingredients', album: 'Choose from album', supplement: 'Add a food label photo', photo: 'Label photo', loading: 'Checking ingredients', all: 'All ingredients', known: 'Known conflict', retake: 'Retake', empty: 'No ingredients identified', readFailure: 'Some photos could not be read', translationFailure: 'Translation failed; original names retained', stats: (n:number, k:number)=>`${n} ingredients identified · ${k} known conflicts` }
}
export const foodLabelLanguage = (language:string)=>language.toLowerCase().startsWith('en')?'en':'zh'
export function ingredientTranslation(row:{original:string;chinese:string;english?:string;sourceLanguage?:string},language:'zh'|'en') {
  const source=row.sourceLanguage?.split('-')[0] ?? (/\p{Script=Han}/u.test(row.original)?'zh':/^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Symbol}\s]+$/u.test(row.original)?'en':'und')
  if(source===language)return ''
  const translation=(language==='zh'?row.chinese:row.english??'').trim()
  return translation&&translation.normalize('NFKC').toLowerCase()!==row.original.trim().normalize('NFKC').toLowerCase()?translation:''
}
