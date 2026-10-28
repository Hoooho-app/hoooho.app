import {test,expect} from '@playwright/test'
import sharp from 'sharp'
import {TokenService} from '../../server/auth/token-service.mjs'
const control='http://127.0.0.1:4888',token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
test.beforeEach(async({page,request})=>{
 await request.get(`${control}/success`);await request.get(`${control}/delay?ms=30`)
 await page.addInitScript(token=>sessionStorage.setItem('hoooho-auth-token',token),token)
})
async function upload(page){
 const buffer=await sharp({create:{width:100,height:120,channels:3,background:'#669988'}}).png().toBuffer()
 await page.goto('/tests/upload-recognition/reminder.html')
 await page.locator('input[type=file]').setInputFiles({name:'合成资料.png',mimeType:'image/png',buffer})
}
test('adopting one candidate leaves the remaining candidates and their source text visible',async({page,request},info)=>{
 const names=['合成药品甲','合成药品乙']
 await request.post(`${control}/draft-data`,{data:{ocrText:names.join('\n'),items:names.map(value=>({category:'medication',title:value,timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'medicationName',value,quote:value,sourceId:'@first',page:1}]}))}})
 await upload(page)
 const panel=page.getByRole('region',{name:'图片识别'}),adopt=panel.getByRole('button',{name:'已核对，采用识别结果',exact:true})
 await expect(adopt).toHaveCount(2)
 await adopt.first().click();await expect(page.getByLabel('药品名称',{exact:true})).toHaveValue(names[0])
 await expect(adopt).toHaveCount(1);await expect(panel).toContainText(names[1])
 await page.screenshot({path:info.outputPath('remaining-upload-candidate.png')})
 await adopt.click();await expect(page.getByLabel('药品名称',{exact:true})).toHaveValue(names[1])
 await expect(panel.getByText('已采用，请核对后保存',{exact:true})).toHaveCount(2)
})
test('partial recognition warning and sourced fields survive adoption',async({page,request})=>{
 const value='合成测试药品'
 await request.post(`${control}/draft-data`,{data:{ocrText:`${value}\n规格：10 mg / 片`,items:[{category:'medication',title:'合成原件',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'medicationName',value,quote:value,sourceId:'@first',page:1}]}]}})
 await upload(page)
 const panel=page.getByRole('region',{name:'图片识别'})
 await expect(panel).toContainText('部分内容尚未识别完整')
 await panel.getByRole('button',{name:'已核对，采用识别结果',exact:true}).click()
 await expect(page.getByLabel('药品名称',{exact:true})).toHaveValue(value)
 await expect(panel).toContainText('部分内容尚未识别完整');await expect(panel).toContainText(`原文：${value}`)
})
