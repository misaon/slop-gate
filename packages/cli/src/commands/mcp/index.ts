import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { defineCommand } from 'citty'
import { readCliVersion } from '../../version.ts'
import { createInFlight } from './in-flight.ts'
import { buildMcpServer } from './server.ts'

/**
 * `sgate mcp` — spec §12.1. slop-gate over the Model Context Protocol, so an agent can *call* the analysis
 * rather than parse a CLI's stdout.
 *
 * **Stateless, revision 2026-07-28.** No `initialize` handshake and no protocol-level session: every request
 * carries its protocol version and client capabilities in `_meta`, and `server/discover` answers "what do you
 * support" in one round trip. slop-gate holds nothing between calls, so a session would model state that does
 * not exist; the SDK still serves a 2025-era client that opens with `initialize`.
 *
 * **stdio only, and nothing here writes to the user's repository.** HTTP is in §12.1 and deliberately not in
 * this command — it is network-facing, it is where the revision's authorization hardening applies, and a
 * listening socket needs a threat model rather than a flag; under stdio the client launches the process and
 * owns both ends of the pipe, so the operating system's own process permissions are the access control.
 * `propose_fixes` runs the real fix pipeline with `dryRun: true` **hard-coded, not defaulted**, and no argument
 * turns it off: a model calling a tool has no human at the terminal to read a refusal, and an applied edit it
 * did not expect lands in a repository nobody is watching.
 */
export const mcp = defineCommand({
  meta: { name: 'mcp', description: 'Serve slop-gate over the Model Context Protocol (stdio)' },
  async run() {
    // Run by hand this reads JSON-RPC from a terminal and looks hung. Safe to say so on stderr: the stdio
    // binding leaves stderr free for logging and tells clients not to read it as failure, and a real host
    // never sees it — it launches this as a subprocess with a pipe, where `isTTY` is undefined.
    if (process.stdin.isTTY === true) {
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
        // stderr, never stdout: the transport owns stdout, and the stdio binding says a server MUST NOT write
        // anything there that is not an MCP message — so stderr is the only channel an operator can be told
        // anything on without corrupting the stream.
        onerror: (error) => process.stderr.write(`slop-gate mcp: ${error.message}\n`),
      },
    )

    // Closing stdin is the stdio binding's shutdown signal, and the SDK's transport does not act on it, so this
    // is what keeps the process alive at all: without it `run` returns immediately, citty's dispatch finishes
    // and Node exits while the server is still listening. `idle()` — see `in-flight.ts` — keeps it alive long
    // enough to answer a request that arrived before EOF.
    await new Promise<void>((resolve) => {
      process.stdin.once('end', resolve)
      process.stdin.once('close', resolve)
    })
    await inFlight.idle()
    // `idle()` waits for the *handler*, and the SDK serialises and writes the response one microtask after that
    // resolves — one microtask after `handle.close()` would otherwise have torn the transport down.
    // `setImmediate` runs in the check phase, once the microtask queue has drained, so by here the response has
    // reached the wire. **With the handler wait alone and no drain, `printf '…' | sgate mcp` exits 0 having
    // written nothing.**
    await new Promise<void>((resolve) => void setImmediate(resolve))
    await handle.close()
  },
})
