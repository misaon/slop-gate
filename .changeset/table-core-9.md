---
'@misaon/slop-gate-rules-explorer': patch
---

TanStack Table 9 for the rules explorer. The Preact binding drops the filtered and faceted row models
it registered and never used — `app.tsx` narrows the rows itself — which takes the client bundle from
213.50 kB to 196.82 kB.
