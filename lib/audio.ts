export function pcmToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
export function decodePcm(base64: string) {
  const binary = atob(base64);
  if (binary.length % 2) throw new Error("Invalid PCM byte length");
  const data = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++)
    data.setUint8(i, binary.charCodeAt(i));
  const samples = new Float32Array(binary.length / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = data.getInt16(i * 2, true) / 32768;
  return samples;
}
export class AudioOutput {
  context: AudioContext;
  next = 0;
  generation = 0;
  sources = new Set<AudioBufferSourceNode>();
  constructor(context: AudioContext) {
    this.context = context;
  }
  async enqueue(base64: string) {
    const generation = this.generation;
    if (this.context.state === "closed") return;
    try {
      await this.context.resume();
    } catch {
      return;
    }
    if (generation !== this.generation) return;
    const samples = decodePcm(base64);
    const buffer = this.context.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.next = Math.max(this.next, this.context.currentTime);
    source.start(this.next);
    this.next += buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
  }
  interrupt() {
    this.generation++;
    for (const source of this.sources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.sources.clear();
    this.next = 0;
  }
}
