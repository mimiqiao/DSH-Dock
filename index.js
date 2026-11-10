import { join } from 'node:path'
import { homedir } from 'node:os'
import { LibraryStore } from './library-store.js'
import { libraryRoutes } from './library-routes.js'
import { z } from 'zod'
import { fold, initialState, viewOf } from './model.js'

// State is versioned and replayed by Harness. Item records retain optional format metadata.
const item = z.object({ id: z.string(), kind: z.string(), title: z.string(), seq: z.number(), time: z.number(), revisions: z.number(), firstSeq: z.number(), topic: z.string() }).passthrough()
const fields = { cwd: z.string(), items: z.array(item), running: z.boolean(), status: z.string(), turns: z.number(), toolCalls: z.number(), lastActivity: z.number(), topic: z.string(), request: z.string(), summary: z.string() }
export function apply(ctx) {
  const projections = ctx.get('sessionProjections')
  if (!projections) { ctx.logger?.warn?.('[desk-workbench] sessionProjections unavailable'); return }
  ctx.inject(['connection'], async scope => {
    const root=join(process.env.DSH_HOME || join(homedir(),'.dsh'),'desk-workbench')
    const store=await new LibraryStore(root).init()
    for(const route of libraryRoutes(store))scope.connection.fetch.register(route)
  })
  // Registry owns the calling fiber and disposes registration on plugin unload.
  return projections.register({ key: 'desk', stateVersion: 6,
    stateSchema: z.object({ ...fields, pending: z.record(z.string(), z.object({ name: z.string() }).passthrough()) }),
    init: initialState, apply: fold,
    wire: { viewSchema: z.object({ ...fields, produced: z.number() }), view: viewOf },
  })
}
export const inject = ['sessionProjections']
