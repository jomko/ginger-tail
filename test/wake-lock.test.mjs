import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileStore, runWake, resolvePendingAction } from '../src/index.mjs'
import { deadPid, effectLines, identity, linuxOnly, plantLock, plantOwner, runWorker, sandbox, startWorker } from './helpers.mjs'

const rest = store => ({ identity, store, world: { observe: () => ({}) }, decide: async () => ({ kind: 'rest' }) })
const lockFile = directory => join(directory, 'wake.lock')

test('a SIGKILLed lock holder does not lock the agent out', { skip: linuxOnly }, () => sandbox(async ({ directory, effects }) => {
  const holder = startWorker(directory, 'hold', effects)
  const { locked } = await holder.ready
  const store = createFileStore({ directory, agentId: identity.id })
  try {
    const live = await store.inspectLock()
    assert.equal(live.status, 'live')
    assert.equal(live.owner.pid, locked)
    await assert.rejects(runWake(rest(store)), { code: 'WAKE_LOCKED' })
  } finally { holder.child.kill('SIGKILL') }
  assert.equal((await holder.exit).signal, 'SIGKILL')
  assert.deepEqual(await store.inspectLock().then(lock => [lock.status, lock.reason]), ['stale', 'owner_exited'])
  assert.deepEqual(await runWake(rest(store)), { outcome: 'rest', wakes: 1 })
  assert.deepEqual(await readdir(directory), ['state.json'])
}))

test('a living holder keeps its lock: wakes and reconciliation fail closed without touching it', { skip: linuxOnly }, () => sandbox(async ({ directory, effects }) => {
  const holder = startWorker(directory, 'hold', effects)
  await holder.ready
  try {
    const store = createFileStore({ directory, agentId: identity.id })
    const before = await readFile(lockFile(directory), 'utf8')
    await assert.rejects(runWake(rest(store)), error =>
      error.code === 'WAKE_LOCKED' && error.lock.reason === 'owner_running' && /already locked/.test(error.message))
    await assert.rejects(resolvePendingAction({ identity, store, actionId: 'a', resolvedBy: 'op',
      verify: () => assert.fail('must not verify') }), { code: 'WAKE_LOCKED' })
    assert.equal(await readFile(lockFile(directory), 'utf8'), before)
  } finally { holder.child.kill('SIGKILL'); await holder.exit }
}))

test('concurrent processes never run two wakes at once, including during stale recovery', { skip: linuxOnly }, () => sandbox(async ({ root, directory, effects }) => {
  for (const staleFirst of [false, true]) {
    await mkdir(directory, { recursive: true })
    if (staleFirst) await plantLock(directory, { pid: await deadPid() })
    const marker = join(root, 'inside.marker')
    const exits = await Promise.all(Array.from({ length: 6 }, () =>
      runWorker(directory, 'contend', effects, marker)))
    const results = exits.map(exit => exit.results[0])
    const rested = results.filter(result => result.outcome === 'rest')
    assert.ok(rested.length >= 1, JSON.stringify(results))
    for (const result of results) {
      assert.ok(result.outcome === 'rest' || result.error === 'WAKE_LOCKED', JSON.stringify(result))
    }
    assert.deepEqual(await effectLines(effects), [], 'two wakes overlapped')
    assert.deepEqual((await readdir(directory)).sort(), ['state.json'])
  }
}))

test('stale locks are recovered only with proof the owner is gone', { skip: linuxOnly }, () => sandbox(async ({ directory }) => {
  await mkdir(directory)
  const store = createFileStore({ directory, agentId: identity.id })
  const cases = [
    [{ pid: await deadPid() }, 'owner_exited'],
    [{ processStart: '1' }, 'pid_reused'], // this PID is alive but started at another time
    [{ bootId: '00000000-0000-0000-0000-000000000000' }, 'owner_boot_ended'],
  ]
  for (const [overrides, reason] of cases) {
    await plantLock(directory, overrides)
    assert.equal((await store.inspectLock()).reason, reason)
    await runWake(rest(store))
    assert.equal((await store.inspectLock()).status, 'free')
  }
  assert.equal((await store.load()).wakes, 3)
}))

test('uncertain lock ownership fails closed and leaves the lock byte-for-byte intact', { skip: linuxOnly }, () => sandbox(async ({ directory }) => {
  await mkdir(directory)
  const store = createFileStore({ directory, agentId: identity.id })
  const legacy = async content => { await writeFile(lockFile(directory), content) }
  const cases = [
    [() => plantLock(directory), 'owner_running'], // this very process
    [() => plantLock(directory, { hostname: 'another-host' }), 'different_host'],
    [() => plantLock(directory, { bootId: 'other', machineId: 'other-machine' }), 'different_boot'],
    [() => plantLock(directory, { pidNamespace: 'pid:[1]' }), 'different_pid_namespace'],
    [() => plantLock(directory, { bootId: null }), 'unverifiable_platform'],
    [() => legacy(''), 'unreadable_lock_metadata'], // a v0.1.0 lock file
    [() => legacy('held'), 'unreadable_lock_metadata'],
  ]
  for (const [plant, reason] of cases) {
    await plant()
    const before = await readFile(lockFile(directory), 'utf8')
    await assert.rejects(runWake(rest(store)), error => error.lock?.reason === reason)
    assert.equal(await readFile(lockFile(directory), 'utf8'), before, reason)
  }
  assert.equal((await store.load()).wakes, 0)
}))

test('a recovery claim with unprovable ownership blocks recovery rather than racing it', { skip: linuxOnly }, () => sandbox(async ({ directory }) => {
  await mkdir(directory)
  const store = createFileStore({ directory, agentId: identity.id })
  const stale = await plantLock(directory, { pid: await deadPid() })
  const claim = lockFile(directory) + '.recover-' + stale.token
  for (const plant of [() => writeFile(claim, '{}'), () => plantOwner(claim), () => plantOwner(claim, { hostname: 'other-host' })]) {
    await plant()
    const before = await readFile(claim, 'utf8')
    await assert.rejects(runWake(rest(store)), error => error.lock.reason === 'recovery_in_progress')
    assert.equal(JSON.parse(await readFile(lockFile(directory), 'utf8')).token, stale.token)
    assert.equal(await readFile(claim, 'utf8'), before)
  }
}))

test('recovery claims abandoned by dead recoverers are recovered, up to a bounded depth', { skip: linuxOnly }, () => sandbox(async ({ directory }) => {
  await mkdir(directory)
  const store = createFileStore({ directory, agentId: identity.id })
  for (const levels of [1, 2, 3]) {
    const stale = await plantLock(directory, { pid: await deadPid() })
    let target = lockFile(directory)
    let token = stale.token
    for (let level = 0; level < levels; level++) {
      target = `${target}.recover-${token}`
      token = (await plantOwner(target, { pid: await deadPid() })).token
    }
    if (levels < 3) {
      assert.deepEqual(await runWake(rest(store)), { outcome: 'rest', wakes: levels })
      assert.deepEqual(await readdir(directory), ['state.json'])
    } else {
      await assert.rejects(runWake(rest(store)), error => error.lock.reason === 'recovery_in_progress')
      assert.equal(JSON.parse(await readFile(lockFile(directory), 'utf8')).token, stale.token)
    }
  }
}))

test('concurrent processes recovering a stale lock and a dead claim never overlap', { skip: linuxOnly }, () => sandbox(async ({ root, directory, effects }) => {
  await mkdir(directory)
  const stale = await plantLock(directory, { pid: await deadPid() })
  await plantOwner(lockFile(directory) + '.recover-' + stale.token, { pid: await deadPid() })
  const marker = join(root, 'inside.marker')
  const results = (await Promise.all(Array.from({ length: 6 }, () =>
    runWorker(directory, 'contend', effects, marker)))).map(exit => exit.results[0])
  assert.ok(results.some(result => result.outcome === 'rest'), JSON.stringify(results))
  for (const result of results) assert.ok(result.outcome === 'rest' || result.error === 'WAKE_LOCKED', JSON.stringify(result))
  assert.deepEqual(await effectLines(effects), [], 'two wakes overlapped')
  assert.deepEqual(await readdir(directory), ['state.json'])
}))

test('two wakes in one process are mutually exclusive', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  let release
  const first = runWake({ ...rest(store), decide: () => new Promise(resolve => { release = resolve }) })
  while (!release) await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(runWake(rest(store)), { code: 'WAKE_LOCKED' })
  release({ kind: 'rest' })
  assert.deepEqual(await first, { outcome: 'rest', wakes: 1 })
}))

test('release never deletes a lock this wake does not own', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  const foreign = JSON.stringify({ version: 1, token: '00000000-0000-4000-8000-000000000000' })
  const warnings = []
  const onWarning = warning => warnings.push(warning.code)
  process.on('warning', onWarning)
  try {
    await store.withLock(() => writeFile(lockFile(directory), foreign))
    await new Promise(resolve => setImmediate(resolve))
  } finally { process.off('warning', onWarning) }
  assert.equal(await readFile(lockFile(directory), 'utf8'), foreign)
  assert.deepEqual(warnings, ['GINGER_TAIL_LOCK_LOST'])
}))

test('cancellation is bounded before the reservation and never abandons an execution', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  await assert.rejects(runWake({ ...rest(store), signal: AbortSignal.abort() }), { name: 'AbortError' })

  // A hung model call no longer holds the lock forever.
  const hung = new AbortController()
  const pending = runWake({ ...rest(store), decide: () => new Promise(() => {}), signal: hung.signal })
  setTimeout(() => hung.abort(), 20)
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal((await store.inspectLock()).status, 'free')
  assert.equal((await store.load()).wakes, 0)

  // Once the reservation exists, the effect runs to completion.
  const late = new AbortController()
  let executions = 0
  const result = await runWake({ identity, store, authorize: async () => true, signal: late.signal,
    decide: async () => ({ kind: 'action', action: { kind: 'note', payload: {} } }),
    world: { observe: () => ({}), execute: async () => {
      late.abort()
      executions++
      return { status: 'confirmed', receiptId: 'r-1' }
    } } })
  assert.equal(result.outcome, 'acted')
  assert.equal(executions, 1)
}))

test('an abort while the lock or state is loading never invokes a port or leaks a rejection', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  const controller = new AbortController()
  const loading = { ...store, load: async () => { controller.abort(); return store.load() } }
  const unhandled = []
  const onUnhandled = reason => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  let observed = 0
  try {
    await assert.rejects(runWake({ identity, store: loading, signal: controller.signal, decide: async () => ({ kind: 'rest' }),
      world: { observe: async ({ signal }) => { observed++; signal.throwIfAborted() } } }), { name: 'AbortError' })
    await new Promise(resolve => setTimeout(resolve, 20))
  } finally { process.off('unhandledRejection', onUnhandled) }
  assert.equal(observed, 0)
  assert.deepEqual(unhandled, [])
}))
