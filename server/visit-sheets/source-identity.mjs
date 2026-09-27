import { createHash } from 'node:crypto'
export const profileSourceId=(section,item)=>`profile:${section}:${item.id??createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0,16)}`
