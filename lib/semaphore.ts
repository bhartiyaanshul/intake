// Minimal async semaphore. Used to cap concurrent Groq extraction calls at 2 so
// we stay well under rate limits while still processing uploads concurrently.

export class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
    return () => this.release();
  }

  private release() {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}
