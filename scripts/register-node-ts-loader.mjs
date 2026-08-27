import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./node-ts-loader.mjs', pathToFileURL(`${process.cwd()}/scripts/`))
