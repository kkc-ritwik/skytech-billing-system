import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { hostname, cpus, platform, arch } from 'os'

let cached: string | null = null

/**
 * A stable per-machine fingerprint used to bind a license to one computer.
 * Primary source on Windows is the registry MachineGuid (survives reinstalls of
 * our app). Falls back to a composite of stable hardware/OS attributes.
 * The raw values are hashed so we never expose identifying info in the key.
 */
export function getMachineFingerprint(): string {
  if (cached) return cached
  let raw = ''
  try {
    if (platform() === 'win32') {
      const out = execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      )
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/)
      if (m) raw = m[1]
    }
  } catch {
    // ignore, fall back below
  }
  if (!raw) {
    raw = [hostname(), platform(), arch(), cpus()[0]?.model ?? ''].join('|')
  }
  cached = createHash('sha256').update(raw).digest('hex').slice(0, 32).toUpperCase()
  return cached
}
