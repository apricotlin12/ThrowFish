export class Sound {
  enabled: boolean;
  private context?: AudioContext;
  constructor(enabled: boolean) { this.enabled = enabled; }
  unlock() {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); } catch { return; }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }
  play(kind: 'grab' | 'throw' | 'hit' | 'success' | 'fail') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const notes = kind === 'success' ? [392,494,587,784] : kind === 'fail' ? [196,147] :
      kind === 'grab' ? [330] : kind === 'throw' ? [600] : [110];
    notes.forEach((hz,n) => {
      const ctx = this.context!, osc=ctx.createOscillator(), gain=ctx.createGain(), t=ctx.currentTime+n*.09;
      osc.type=kind==='hit'?'triangle':'square';osc.frequency.setValueAtTime(hz,t);
      if(kind==='throw')osc.frequency.exponentialRampToValueAtTime(150,t+.14);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.025,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+.13);
      osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+.15);
    });
  }
}
