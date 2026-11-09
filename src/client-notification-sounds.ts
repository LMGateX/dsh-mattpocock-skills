import { LOCAL_NOTIFICATION_SOUNDS } from './client-notification-sound-data.js'
import type { NotificationSoundChoice } from './client-notification-sound-data.js'
import type { NotificationSound } from './client-notifications.js'

/** One browser port owns unlock state and serializes samples across mounted sessions.
 * No network, timers, DOM, or AudioContext construction at module evaluation. */
export function localNotificationSoundFactory(Audio: typeof AudioContext): (choice?: NotificationSoundChoice, gesture?: boolean) => NotificationSound {
  let unlocked = false
  let activeStop: (() => void) | undefined
  return (choice = 'toast', gesture = false) => {
    activeStop?.()
    const context = new Audio()
    const nodes = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>()
    let stopped = false, started = false
    const stop = (): void => {
      if (stopped) return
      stopped = true
      for (const { source, gain } of nodes) {
        source.onended = null
        try { source.stop() } catch { /* already ended */ }
        source.disconnect(); gain.disconnect()
      }
      nodes.clear()
      if (activeStop === stop) activeStop = undefined
      void context.close().catch(() => {})
    }
    activeStop = stop
    return { state: () => context.state, stop,
      start: async (seconds, volume) => {
        if (started || stopped) return
        started = true
        try {
          if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60 || !Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error('无效声音预算或音量')
          if (volume === 0) { stop(); return }
          if (!gesture && !unlocked) throw new Error('请显式试听以解锁声音')
          // resume() must be invoked synchronously in the explicit gesture, before decoding.
          if (gesture && context.state === 'suspended') await context.resume()
          if (stopped) return
          if (context.state !== 'running') throw new Error('声音被浏览器挂起，请显式试听')
          if (gesture) unlocked = true
          const sample = LOCAL_NOTIFICATION_SOUNDS[choice]
          if (!sample) throw new Error('未知铃声')
          const bytes = Uint8Array.from(atob(sample.base64), char => char.charCodeAt(0))
          const buffer = await context.decodeAudioData(bytes.buffer)
          // Stops during resume/decode are terminal, including scope loss and a newer preview.
          if (stopped) return
          if (context.state !== 'running' || !Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 2) throw new Error('声音解码或浏览器状态无效')
          const begin = context.currentTime, end = begin + seconds
          const level = volume / 100 * sample.calibrationGain
          // Fixed half-second silence between motifs. No loop/time-stretch/overlap.
          for (let at = begin, count = 0; at < end && count < 128; at += buffer.duration + 0.5, count++) {
            const until = Math.min(at + buffer.duration, end)
            if (until - at < 0.03) break
            const source = context.createBufferSource(), gain = context.createGain()
            const node = { source, gain }; nodes.add(node)
            source.buffer = buffer
            source.connect(gain); gain.connect(context.destination)
            gain.gain.setValueAtTime(0, at)
            gain.gain.linearRampToValueAtTime(level, at + 0.008)
            gain.gain.setValueAtTime(level, Math.max(at + 0.008, until - 0.02))
            gain.gain.linearRampToValueAtTime(0, until)
            source.onended = () => { source.disconnect(); gain.disconnect(); nodes.delete(node); if (!nodes.size) stop() }
            source.start(at); source.stop(until)
          }
          if (!nodes.size) stop()
        } catch (error) { stop(); throw error }
      },
    }
  }
}
