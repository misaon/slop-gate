import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { defineCommand } from 'citty'
import { readCliVersion } from '../../version.ts'
import { createInFlight } from './in-flight.ts'
import { buildMcpServer } from './server.ts'

/**
 * `sgate mcp` — spec §12.1. slop-gate over the Model Context Protocol, so an agent can *call* the
 * analysis rather than parse a CLI's stdout.
 *
 * **Stateless, revision 2026-07-28.** There is no `initialize` handshake and no protocol-level
 * session: every request carries its own protocol version and client capabilities in `_meta`, and
 * `server/discover` answers "what do you support" in one round trip. That is the whole reason this
 * revision was chosen — slop-gate holds nothing between calls, so a protocol that insists on a
 * session would be modelling state that does not exist. The SDK still serves a 2025-era client that
 * opens with `initialize`; nothing here depends on which era the caller is from.
 *
 * **stdio only.** HTTP is in §12.1 and is deliberately not in this command. It is network-facing, it
 * is where the revision's authorization hardening applies, and shipping a listening socket needs a
 * threat model rather than a flag — see the follow-ups. stdio has no such surface: the client
 * launches the process, owns both ends of the pipe, and the operating system's own process
 * permissions are the access control.
 *
 * **Nothing here writes to the user's repository, and no tool can be asked to.** `propose_fixes`
 * runs the real fix pipeline with `dryRun: true` hard-coded — not defaulted — and there is no
 * argument that turns it off. `sgate fix` refuses a dirty worktree, defaults to the `safe` tier and
 * offers `--dry-run` because a human is standing at the terminal to read the refusal and decide. A
 * model calling a tool has none of that, and an applied edit it did not expect lands in a repository
 * nobody is watching. Exposing the diff costs the caller one shell command and keeps the decision
 * with the person whose files they are.
 */
export const mcp = defineCommand({
  meta: { name: 'mcp', description: 'Serve slop-gate over the Model Context Protocol (stdio)' },
  async run() {
    // The one place this command is confusing: run by hand, it reads JSON-RPC from a terminal and
    // looks hung. stderr is free for logging under the stdio binding and a client is told not to
    // read it as failure, so saying so costs nothing and is never seen by a real host — a client
    // launches this as a subprocess with a pipe, where `isTTY` is undefined.
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
        // stderr, never stdout: the transport owns stdout, and the stdio binding says a server MUST
        // NOT write anything there that is not an MCP message. A client is told to treat stderr as
        // logging rather than as failure, so this is the only channel an operator can be told
        // anything on without corrupting the stream.
        onerror: (error) => process.stderr.write(`slop-gate mcp: ${error.message}\n`),
      },
    )

    // Closing stdin is the stdio binding's shutdown signal, and the SDK's transport does not act on
    // it, so this is what keeps the process alive at all: without it `run` returns immediately,
    // citty's dispatch finishes and Node exits while the server is still listening. `idle()` is what
    // keeps it alive long enough — see `in-flight.ts` for the request this otherwise throws away.
    await new Promise<void>((resolve) => {
      process.stdin.once('end', resolve)
      process.stdin.once('close', resolve)
    })
    await inFlight.idle()
    // `idle()` waits for the *handler*, and the SDK serialises and writes the response after that
    // resolves — one microtask later, which is one microtask after `handle.close()` would otherwise
    // have torn the transport down. `setImmediate` runs in the check phase, after the microtask
    // queue has drained, so by here the response has reached the wire. Measured, not assumed: with
    // the handler wait alone and no drain, `printf '…' | sgate mcp` exits 0 having written nothing.
    await new Promise<void>((resolve) => void setImmediate(resolve))
    await handle.close()
  },
})
