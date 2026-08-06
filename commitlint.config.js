export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [0],
    // Commit bodies here are prose carrying measurements, and they are wrapped by hand.
    'body-max-line-length': [0],
    // Same reason, and a false positive on top of it: the parser starts the footer at any line whose
    // first word ends in a colon, so a wrapped sentence beginning "swallowed: a gate that failed…"
    // turns the rest of the message into a footer and then measures it. Nothing about that is a
    // footer, and the length was already deliberate.
    'footer-max-line-length': [0],
  },
}
