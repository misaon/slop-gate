import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { App } from './app.tsx'
import './styles.css'

/**
 * `staleTime: Infinity` and no window-focus refetch, because this page does not guess when its data changed —
 * the server tells it. `/api/changes` streams a generation number whenever core's source moves, and the app
 * invalidates on that event, so a poll would only add requests that answer a question already answered.
 *
 * `retry: 1` rather than the default three: both endpoints are on localhost, so a failure is a real failure
 * and three exponential backoffs just delay the error a reader needs to see.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const root = document.getElementById('app')
if (root === null) throw new Error('#app is missing from index.html')
render(
  <QueryClientProvider client={client}>
    <App />
  </QueryClientProvider>,
  root,
)
