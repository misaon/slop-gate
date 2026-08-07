export type CorpusRepo = {
  readonly name: string
  readonly url: string
  /** A tag or branch to clone. The commit it resolved to is written to `corpus.lock.json`. */
  readonly ref: string
  readonly side: 'frontend' | 'backend'
  /** What this repository is here to represent; no two entries should carry the same one twice. */
  readonly stack: string
}

/**
 * Fifty repositories, half rendering and half serving, chosen so no framework contributes more than two.
 * A rule that fires everywhere and a rule that fires on one stack look identical on a single repository,
 * and telling those apart is the whole reason this corpus exists.
 */
export const CORPUS: readonly CorpusRepo[] = [
  { name: 'excalidraw', url: 'https://github.com/excalidraw/excalidraw', ref: 'master', side: 'frontend', stack: 'react-canvas' },
  { name: 'redux-toolkit', url: 'https://github.com/reduxjs/redux-toolkit', ref: 'master', side: 'frontend', stack: 'react-state' },
  { name: 'commerce', url: 'https://github.com/vercel/commerce', ref: 'main', side: 'frontend', stack: 'nextjs' },
  { name: 'react-router', url: 'https://github.com/remix-run/react-router', ref: 'main', side: 'frontend', stack: 'react-routing' },
  { name: 'tanstack-query', url: 'https://github.com/TanStack/query', ref: 'main', side: 'frontend', stack: 'react-data' },
  { name: 'vue-core', url: 'https://github.com/vuejs/core', ref: 'main', side: 'frontend', stack: 'vue' },
  { name: 'vueuse', url: 'https://github.com/vueuse/vueuse', ref: 'main', side: 'frontend', stack: 'vue-composables' },
  { name: 'vuestic-admin', url: 'https://github.com/epicmaxco/vuestic-admin', ref: 'develop', side: 'frontend', stack: 'vue-admin' },
  { name: 'svelte', url: 'https://github.com/sveltejs/svelte', ref: 'main', side: 'frontend', stack: 'svelte' },
  { name: 'sveltekit', url: 'https://github.com/sveltejs/kit', ref: 'main', side: 'frontend', stack: 'svelte-meta' },
  { name: 'ngx-admin', url: 'https://github.com/akveo/ngx-admin', ref: 'master', side: 'frontend', stack: 'angular' },
  { name: 'solid', url: 'https://github.com/solidjs/solid', ref: 'main', side: 'frontend', stack: 'solid' },
  { name: 'preact', url: 'https://github.com/preactjs/preact', ref: 'main', side: 'frontend', stack: 'preact' },
  { name: 'astro', url: 'https://github.com/withastro/astro', ref: 'main', side: 'frontend', stack: 'astro' },
  { name: 'qwik', url: 'https://github.com/QwikDev/qwik', ref: 'main', side: 'frontend', stack: 'qwik' },
  { name: 'vite', url: 'https://github.com/vitejs/vite', ref: 'main', side: 'frontend', stack: 'bundler' },
  { name: 'tailwindcss-com', url: 'https://github.com/tailwindlabs/tailwindcss.com', ref: 'main', side: 'frontend', stack: 'docs-site' },
  { name: 'html5-boilerplate', url: 'https://github.com/h5bp/html5-boilerplate', ref: 'main', side: 'frontend', stack: 'plain-html' },
  { name: 'bootstrap', url: 'https://github.com/twbs/bootstrap', ref: 'main', side: 'frontend', stack: 'css-framework' },
  { name: 'chakra-ui', url: 'https://github.com/chakra-ui/chakra-ui', ref: 'main', side: 'frontend', stack: 'react-components' },
  { name: 'radix-primitives', url: 'https://github.com/radix-ui/primitives', ref: 'main', side: 'frontend', stack: 'react-headless' },
  { name: 'zustand', url: 'https://github.com/pmndrs/zustand', ref: 'main', side: 'frontend', stack: 'react-store' },
  { name: 'lit', url: 'https://github.com/lit/lit', ref: 'main', side: 'frontend', stack: 'web-components' },
  { name: 'motion', url: 'https://github.com/motiondivision/motion', ref: 'main', side: 'frontend', stack: 'animation' },
  { name: 'nuxt-com', url: 'https://github.com/nuxt/nuxt.com', ref: 'main', side: 'frontend', stack: 'nuxt' },

  { name: 'express', url: 'https://github.com/expressjs/express', ref: 'master', side: 'backend', stack: 'express' },
  { name: 'fastify', url: 'https://github.com/fastify/fastify', ref: 'main', side: 'backend', stack: 'fastify' },
  { name: 'nest', url: 'https://github.com/nestjs/nest', ref: 'master', side: 'backend', stack: 'nestjs' },
  { name: 'hono', url: 'https://github.com/honojs/hono', ref: 'main', side: 'backend', stack: 'hono' },
  { name: 'koa', url: 'https://github.com/koajs/koa', ref: 'master', side: 'backend', stack: 'koa' },
  { name: 'h3', url: 'https://github.com/h3js/h3', ref: 'main', side: 'backend', stack: 'unjs' },
  { name: 'elysia', url: 'https://github.com/elysiajs/elysia', ref: 'main', side: 'backend', stack: 'bun' },
  { name: 'adonis-core', url: 'https://github.com/adonisjs/core', ref: '7.x', side: 'backend', stack: 'adonis' },
  { name: 'trpc', url: 'https://github.com/trpc/trpc', ref: 'main', side: 'backend', stack: 'rpc' },
  { name: 'graphql-js', url: 'https://github.com/graphql/graphql-js', ref: '17.x.x', side: 'backend', stack: 'graphql' },
  { name: 'typeorm', url: 'https://github.com/typeorm/typeorm', ref: 'master', side: 'backend', stack: 'orm-decorators' },
  { name: 'drizzle-orm', url: 'https://github.com/drizzle-team/drizzle-orm', ref: 'main', side: 'backend', stack: 'orm-typed' },
  { name: 'sequelize', url: 'https://github.com/sequelize/sequelize', ref: 'main', side: 'backend', stack: 'orm-classic' },
  { name: 'knex', url: 'https://github.com/knex/knex', ref: 'master', side: 'backend', stack: 'query-builder' },
  { name: 'bullmq', url: 'https://github.com/taskforcesh/bullmq', ref: 'master', side: 'backend', stack: 'queue' },
  { name: 'socket-io', url: 'https://github.com/socketio/socket.io', ref: 'main', side: 'backend', stack: 'realtime' },
  { name: 'pino', url: 'https://github.com/pinojs/pino', ref: 'main', side: 'backend', stack: 'logging' },
  { name: 'got', url: 'https://github.com/sindresorhus/got', ref: 'main', side: 'backend', stack: 'http-client' },
  { name: 'axios', url: 'https://github.com/axios/axios', ref: 'v1.x', side: 'backend', stack: 'http-client-legacy' },
  { name: 'execa', url: 'https://github.com/sindresorhus/execa', ref: 'main', side: 'backend', stack: 'process' },
  { name: 'nodemailer', url: 'https://github.com/nodemailer/nodemailer', ref: 'master', side: 'backend', stack: 'mail' },
  { name: 'zod', url: 'https://github.com/colinhacks/zod', ref: 'main', side: 'backend', stack: 'validation' },
  { name: 'vitest', url: 'https://github.com/vitest-dev/vitest', ref: 'main', side: 'backend', stack: 'test-runner' },
  { name: 'commander', url: 'https://github.com/tj/commander.js', ref: 'master', side: 'backend', stack: 'cli' },
  { name: 'json-server', url: 'https://github.com/typicode/json-server', ref: 'main', side: 'backend', stack: 'mock-server' },
]
