import { setImmediate as yieldToPending } from 'node:timers/promises'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { defineCommand } from 'citty'
import { readCliVersion } from '../../version.ts'
import { createInFlight } from './in-flight.ts'
import { buildMcpServer } from './server.ts'

export const mcp = defineCommand({
  meta: { name: 'mcp', description: 'Serve slop-gate over the Model Context Protocol (stdio)' },
  async run() {
    if (process.stdin.isTTY) {
      process.stderr.write(
        'sgate mcp speaks the Model Context Protocol on stdin/stdout — it is meant to be launched by an MCP client, not run by hand.\n' +
          'Configure your client to run: sgate mcp (with this repository as its working directory).\n' +
          'Waiting for JSON-RPC on stdin; Ctrl-D to exit.\n',
      )
    }

    const inFlight = createInFlight()
    const handle = serveStdio(
      () => buildMcpServer({ serverRoot: process.cwd(), version: readCliVersion(), track: inFlight.track }),
      {
        onerror: (error) => process.stderr.write(`slop-gate mcp: ${error.message}\n`),
      },
    )

    await new Promise<void>((resolve) => {
      process.stdin.once('end', resolve)
      process.stdin.once('close', resolve)
    })
    await inFlight.idle()
    await yieldToPending()
    await handle.close()
  },
})
