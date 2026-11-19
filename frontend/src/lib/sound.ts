// Tiny optional sound effects (off by default). No audio files: short synthesised blips.

let ctx: AudioContext | null = null

export function blip(kind: 'start' | 'step' | 'win' | 'oops'): void {
  try {
    ctx ??= new AudioContext()
    const notes = { start: [440, 660], step: [520], win: [523, 659, 784, 1047], oops: [300, 220] }[kind]
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      const at = ctx!.currentTime + i * 0.09
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(at)
      osc.stop(at + 0.18)
    })
  } catch {
    /* audio is optional */
  }
}
