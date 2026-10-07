import {writeFile} from 'node:fs/promises'
export default async()=>writeFile(new URL('./.shutdown',import.meta.url),'done')
