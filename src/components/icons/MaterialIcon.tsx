import { forwardRef, type SVGProps } from 'react'
import { materialPaths, type MaterialIconName } from './materialPaths'
import './material-icons.css'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string
  selected?: boolean
  /** Accepted during migration. Weight is fixed by the original Material 300 paths. */
  absoluteStrokeWidth?: boolean
}

function iconSize(size: number | string) {
  if (typeof size === 'string' && !/^\d+(\.\d+)?$/.test(size)) return size
  const value = Number(size)
  return value <= 16 ? 16 : value <= 21 ? 20 : value <= 28 ? 24 : 32
}

export const MaterialIcon = forwardRef<SVGSVGElement, IconProps & { name: MaterialIconName }>(function MaterialIcon(
  { name, size = 24, selected, className = '', strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth,
    fill: _fill, stroke: _stroke, children, ...props }, ref
) {
  const paths = materialPaths[name]
  return <svg aria-hidden="true" focusable="false" {...props} ref={ref}
    className={`hoho-icon ${className}`.trim()} data-icon={name} data-icon-selected={selected}
    width={iconSize(size)} height={iconSize(size)} viewBox="0 -960 960 960" fill="currentColor" stroke="none">
    {children}
    <path className="hoho-icon__outline" d={paths.outline} />
    <path className="hoho-icon__solid" d={paths.filled} />
  </svg>
})

export function createMaterialIcon(name: MaterialIconName) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(props, ref) {
    return <MaterialIcon {...props} name={name} ref={ref} />
  })
  Icon.displayName = `MaterialIcon(${name})`
  return Icon
}

export type MaterialIconComponent = ReturnType<typeof createMaterialIcon>
