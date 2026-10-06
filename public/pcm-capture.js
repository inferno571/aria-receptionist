// AudioWorklet: stream 20ms chunks of 16kHz mono PCM, preserving phase across blocks.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.acc = 0;
    this.count = 0;
    this.phase = 0;
    this.samples = [];
    this.ratio = sampleRate / 16000;
  }
  process(inputs) {
    const source = inputs[0]?.[0];
    if (!source) return true;
    for (let i = 0; i < source.length; i++) {
      this.acc += source[i];
      this.count++;
      this.phase++;
      if (this.phase >= this.ratio) {
        this.samples.push(this.acc / this.count);
        this.acc = 0;
        this.count = 0;
        this.phase -= this.ratio;
      }
      if (this.samples.length === 320) {
        const pcm = new Int16Array(320);
        let energy = 0;
        for (let j = 0; j < 320; j++) {
          const v = Math.max(-1, Math.min(1, this.samples[j]));
          pcm[j] = Math.round(v < 0 ? v * 32768 : v * 32767);
          energy += v * v;
        }
        this.port.postMessage(
          { pcm: pcm.buffer, rms: Math.sqrt(energy / 320) },
          [pcm.buffer],
        );
        this.samples = [];
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
