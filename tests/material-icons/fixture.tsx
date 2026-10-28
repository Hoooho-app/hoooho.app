import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MaterialIcon } from '../../src/components/icons/MaterialIcon'
import { materialPaths, type MaterialIconName } from '../../src/components/icons/materialPaths'
import { LoginMethodIcon } from '../../src/pages/Login/LoginMethodIcon'
import { JournalCategoryIcon } from '../../src/pages/HealthEvents/JournalCategoryIcon'
import { DietaryFoodIcon } from '../../src/pages/DietaryCard/DietaryFoodIcon'
import { DietaryCardPanel } from '../../src/pages/DietaryCard/DietaryCardPanel'
import { createDietaryCardPng } from '../../src/pages/DietaryCard/dietaryCardExport'
import { createManualDietaryItem, emptyDietarySnapshot } from '../../src/pages/DietaryCard/dietaryCardModel'
import '../../src/pages/DietaryCard/dietaryCard.css'
import '../../src/styles/index.css'

function Fixture() {
  const [method,setMethod]=useState('password'),[saved,setSaved]=useState(false),[tab,setTab]=useState('calendar')
  const [exportSrc,setExportSrc]=useState('')
  const foods=[['apple','苹果'],['milk','牛奶'],['egg','鸡蛋'],['orange','橘子'],['banana','香蕉'],['peanut','花生'],['soy','大豆'],['wheat','小麦'],['fish','鱼'],['shrimp','虾'],['crab','螃蟹'],['beef','牛肉'],['lamb','羊肉'],['carrot','胡萝卜'],['broccoli','西兰花'],['tomato','番茄']]
  const snapshot={...emptyDietarySnapshot('icon-fixture','2026-10-29T00:00:00Z'),items:foods.map(([foodId,name])=>({...createManualDietaryItem(name,'avoid'),foodId}))}
  return <main style={{padding:16,overflow:'auto',height:'100dvh'}}>
    <h1>图标状态验收</h1>
    <section aria-label="登录方式">{(['password','email','code','apple'] as const).map(name=><button style={{padding:12}} key={name} aria-pressed={method===name} onClick={()=>setMethod(name)} aria-label={name}><LoginMethodIcon name={name}/></button>)}</section>
    <section aria-label="导航">{(['calendar','profile'] as const).map(name=><button style={{padding:12}} key={name} aria-current={tab===name?'page':undefined} onClick={()=>setTab(name)} aria-label={name}><MaterialIcon name={name==='calendar'?'calendar_month':'folder'}/></button>)}</section>
    <button aria-label="关注" aria-pressed={saved} onClick={()=>setSaved(!saved)}><MaterialIcon name="favorite" size={24}/></button>
    <label><input type="checkbox" aria-label="复选框"/>复选</label>
    <label><input type="radio" name="choice" aria-label="单选一"/>一</label>
    <label><input type="radio" name="choice" aria-label="单选二"/>二</label>
    <section aria-label="记录语义">{(['sleep','visit','examination','care'] as const).map(category=><JournalCategoryIcon key={category} category={category}/>)}</section>
    <section aria-label="食物"><DietaryFoodIcon food={{foodId:'apple',name:'苹果'}} group="avoid"/><DietaryFoodIcon food={{foodId:'fish',name:'鳕鱼'}} group="avoid"/><span>鳕鱼</span></section>
    <details><summary>忌口卡与导出验收</summary><DietaryCardPanel snapshot={snapshot} language="zh"/><button onClick={()=>void createDietaryCardPng(snapshot,'zh').then(blob=>setExportSrc(URL.createObjectURL(blob)))}>生成导出图片</button>{exportSrc&&<img alt="导出图片预览" src={exportSrc} style={{maxWidth:'100%'}}/>}</details>
    <section aria-label="全部原图" style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12}}>{(Object.keys(materialPaths) as MaterialIconName[]).map(name=><div key={name} data-symbol={name}><MaterialIcon name={name} size={24} selected={false}/><MaterialIcon name={name} size={24} selected/><small style={{display:'block',fontSize:10,overflowWrap:'anywhere'}}>{name}</small></div>)}</section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
