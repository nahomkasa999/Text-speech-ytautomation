/**
 * Streams the MP4 being muxed into a file on the local server's disk, so a
 * multi-hour export never has to fit in browser memory.
 */

import { StreamTarget } from '../../vendor/mp4-muxer.js';

const CHUNK_SIZE = 8 * 2 ** 20;
const MAX_PENDING_BYTES = 4 * CHUNK_SIZE;

export class ServerFileTarget {
  static async create() {
    const res = await fetch('/api/temp-file/reserve', { method: 'POST' });
    if (!res.ok) throw new Error(`Could not create the export file (${res.status})`);
    return new ServerFileTarget(await res.json());
  }

  constructor({ id, url, free_bytes }) {
    this.id = id;
    this.url = url;
    this.freeBytes = free_bytes;
    this.size = 0;
    this.pendingBytes = 0;
    this.error = null;
    this.tail = Promise.resolve();
    this.target = new StreamTarget({
      chunked: true,
      chunkSize: CHUNK_SIZE,
      onData: (data, position) => this.write(data, position),
    });
  }

  write(data, position) {
    this.pendingBytes += data.byteLength;
    this.size = Math.max(this.size, position + data.byteLength);
    this.tail = this.tail.then(async () => {
      if (this.error) return;
      try {
        const res = await fetch(`/api/temp-file/${this.id}?pos=${position}`, { method: 'PUT', body: data });
        if (!res.ok) throw new Error(`Writing the video to disk failed (${res.status})`);
      } catch (err) {
        this.error = err;
      } finally {
        this.pendingBytes -= data.byteLength;
      }
    });
  }

  /** Waits until the disk has caught up, so unwritten video never piles up in RAM. */
  async drain(maxPending = MAX_PENDING_BYTES) {
    while (this.pendingBytes > maxPending && !this.error) await this.tail;
    if (this.error) throw this.error;
  }

  async close() {
    await this.drain(0);
  }

  async discard() {
    await this.tail.catch(() => {});
    await fetch(`/api/temp-file/${this.id}`, { method: 'DELETE' }).catch(() => {});
  }
}
