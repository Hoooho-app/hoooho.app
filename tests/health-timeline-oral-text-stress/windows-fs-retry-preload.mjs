import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

const originalRename = fs.promises.rename.bind(fs.promises)

fs.promises.rename = async (source, destination) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await originalRename(source, destination)
    } catch (error) {
      if (error?.code !== 'EPERM' || attempt >= 19) throw error
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
    }
  }
}

// Make later named imports from node:fs/promises observe the test-only wrapper.
syncBuiltinESMExports()
