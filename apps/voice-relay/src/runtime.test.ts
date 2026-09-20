import { expect, it } from 'vitest'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { spawn } from 'node:child_process'

it('starts the real entrypoint and runs its shutdown handler without provider calls', async () => {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = (probe.address() as AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()))
  // Dispatch the registered signal handler through IPC: Windows kill() bypasses JS handlers.
  const harness = "await import('./src/main.ts'); process.on('message', message => { if (message === 'shutdown') { process.emit('SIGTERM'); process.disconnect(); } });"
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', harness], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, PORT: String(port), VOICE_RELAY_BIND: '127.0.0.1', SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'synthetic', NCP_CLOVA_VOICE_CLIENT_ID: 'synthetic', NCP_CLOVA_VOICE_CLIENT_SECRET: 'synthetic' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Runtime startup timeout')), 10000)
      child.stdout!.on('data', chunk => { if (String(chunk).includes('Voice relay listening')) { clearTimeout(timer); resolve() } })
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Runtime exited before startup')) })
      child.once('error', () => { clearTimeout(timer); reject(new Error('Runtime spawn failed')) })
    })
    const res = await fetch(`http://127.0.0.1:${port}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'running' })
    expect((await fetch(`http://127.0.0.1:${port}/readyz`)).status).toBe(200)
    let stopped = false
    child.stdout!.on('data', chunk => { if (String(chunk).includes('Voice relay stopped')) stopped = true })
    const exited = once(child, 'exit')
    child.send('shutdown')
    const watchdog = setTimeout(() => child.kill(), 5000)
    const [code] = await exited.finally(() => clearTimeout(watchdog))
    expect(code).toBe(0)
    expect(stopped).toBe(true)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
  }
}, 15000)
