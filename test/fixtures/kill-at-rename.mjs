// Preload for crash tests: GT_KILL_AT_RENAME='before:N' or 'after:N' SIGKILLs
// the process around the Nth rename of a state temporary file. In an
// action wake, rename 1 is the reservation, 2 the receipt record (phase 1)
// and 3 the cleared completion (phase 2). Inert without the variable.
import fs from 'node:fs/promises'

const [when, nth] = (process.env.GT_KILL_AT_RENAME ?? '').split(':')
if (when) {
  const rename = fs.rename
  let count = 0
  fs.rename = async (from, to) => {
    const target = /\.state-.*\.tmp$/.test(from) && ++count === Number(nth)
    if (target && when === 'before') process.kill(process.pid, 'SIGKILL')
    await rename(from, to)
    if (target && when === 'after') process.kill(process.pid, 'SIGKILL')
  }
}
