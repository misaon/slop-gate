// Tests reach `reportTelemetry` for real. A suite that calls `check.run()` in process, or spawns the built
// binary, sends an actual report to the live endpoint — measured: of 717 rows in `telemetry_report`, 572
// came from six- to nine-file fixture directories and 124 from the performance corpus, against 19 from real
// dogfood runs. The dataset this project uses to decide which rules are wrong was 96% its own test suite.
//
// Set here rather than at each call site because the consent check reads `process.env`, so this covers the
// in-process paths and every child that inherits the environment, and a new test cannot forget it.
process.env['SLOP_GATE_TELEMETRY'] = '0'
