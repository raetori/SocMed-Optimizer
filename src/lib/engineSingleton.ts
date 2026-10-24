import { Engine } from './engine'

// One engine for the whole app: it loads a ~32 MB core, so Optimize and Check share it.
export const engine = new Engine()
