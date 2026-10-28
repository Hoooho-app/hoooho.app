import apple from '../../assets/brand/providers/apple.svg?raw'
import wechat from '../../assets/brand/providers/wechat.svg?raw'
import qq from '../../assets/brand/providers/tencentqq.svg?raw'
import type { SVGProps } from 'react'

const sources = { apple, wechat, qq }
// Paths are from committed local brand assets. No user input enters this markup.
const viewBoxes = Object.fromEntries(Object.entries(sources).map(([name, svg]) => [name, svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24']))
const paths = Object.fromEntries(Object.entries(sources).map(([name, svg]) => [name,
  svg.replace(/<title>.*?<\/title>/, '').replace(/^.*?<svg[^>]*>/, '').replace(/<\/svg>.*$/, '')
]))
export function ProviderBrandIcon({ provider, size=24, ...props }: SVGProps<SVGSVGElement> & { provider:keyof typeof sources; size?:number }) {
  return <svg aria-hidden="true" focusable="false" {...props} data-brand={provider} width={size} height={size} viewBox={viewBoxes[provider]} fill="currentColor" stroke="none" dangerouslySetInnerHTML={{__html:paths[provider]}}/>
}
