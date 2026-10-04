const maxBytes=20*1024*1024
const read=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('照片无法读取'));reader.onerror=()=>reject(new Error('照片无法读取'));reader.readAsDataURL(blob)})
export async function prepareFoodLabelPhoto(file:File):Promise<{dataUrl:string}>{
  if(!file.size||file.size>maxBytes)throw new Error('单张照片须小于20MB，请重新拍摄')
  const type=file.type.toLowerCase()||({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',avif:'image/avif'}[file.name.split('.').pop()?.toLowerCase()??''])
  if(!type||!/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(type))throw new Error('照片格式无法读取，请重新拍摄')
  const source=new Blob([file],{type})
  let bitmap:ImageBitmap|undefined
  try{
    bitmap=await createImageBitmap(source,{imageOrientation:'from-image'})
    if(bitmap.width*bitmap.height>40_000_000)throw new Error('照片尺寸过大，请重新拍摄')
    const scale=Math.min(1,2560/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas')
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale)
    const context=canvas.getContext('2d',{alpha:false})
    if(!context)throw new Error('照片处理未完成')
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height)
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92))
    canvas.width=canvas.height=1
    if(!blob)throw new Error('照片处理未完成')
    return {dataUrl:await read(blob)}
  }catch{
    // Safari native decoding or server HEIC decoder handles original orientation.
    return {dataUrl:await read(source)}
  }finally{bitmap?.close()}
}
