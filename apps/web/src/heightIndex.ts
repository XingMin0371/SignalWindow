/**
 * Incremental sqrt-decomposed row-height index.
 * Block layout is stable across prepends; updates cost O(number of blocks)
 * and locating a row costs O(sqrt(n)), instead of rebuilding all offsets.
 */
const BLOCK_SIZE = 64;

type Block = {
  ids: string[];
  heights: number[];
  sum: number;
  start: number;
  index: number;
};

type Position = { block: Block; offset: number };

export class SqrtHeightIndex {
  private blocks: Block[] = [];
  private positions = new Map<string, Position>();
  private blockTops: number[] = [0];

  get size(): number {
    return this.positions.size;
  }

  get total(): number {
    return this.blockTops[this.blockTops.length - 1] || 0;
  }

  reset(): void {
    this.blocks = [];
    this.positions.clear();
    this.blockTops = [0];
  }

  append(id: string, height: number): void {
    if (this.positions.has(id)) {
      this.update(id, height);
      return;
    }
    let block = this.blocks[this.blocks.length - 1];
    if (!block || block.ids.length >= BLOCK_SIZE) {
      block = { ids: [], heights: [], sum: 0, start: 0, index: -1 };
      this.blocks.push(block);
    }
    this.positions.set(id, { block, offset: block.ids.length });
    block.ids.push(id);
    block.heights.push(clampHeight(height));
    block.sum += clampHeight(height);
    this.rebuildTop();
  }

  prepend(entries: Array<{ id: string; height: number }>): void {
    const fresh = entries.filter((entry) => !this.positions.has(entry.id));
    if (!fresh.length) return;
    const headBlocks: Block[] = [];
    for (let index = 0; index < fresh.length; index += BLOCK_SIZE) {
      const block: Block = { ids: [], heights: [], sum: 0, start: 0, index: -1 };
      for (const entry of fresh.slice(index, index + BLOCK_SIZE)) {
        const height = clampHeight(entry.height);
        this.positions.set(entry.id, { block, offset: block.ids.length });
        block.ids.push(entry.id);
        block.heights.push(height);
        block.sum += height;
      }
      headBlocks.push(block);
    }
    this.blocks.unshift(...headBlocks);
    this.rebuildTop();
  }

  update(id: string, height: number): boolean {
    const position = this.positions.get(id);
    if (!position) return false;
    const next = clampHeight(height);
    const previous = position.block.heights[position.offset];
    if (Math.abs(previous - next) < 1) return false;
    position.block.heights[position.offset] = next;
    position.block.sum += next - previous;
    this.rebuildTop();
    return true;
  }

  locate(target: number): number {
    if (!this.size || target <= 0) return 0;
    const tops = this.blockTops;
    let low = 0;
    let high = this.blocks.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (tops[mid] <= target) low = mid;
      else high = mid - 1;
    }
    const block = this.blocks[low];
    let offset = 0;
    let top = tops[low];
    for (; offset < block.heights.length; offset += 1) {
      top += block.heights[offset];
      if (target < top) return block.start + offset;
    }
    return Math.min(this.size - 1, block.start + block.heights.length - 1);
  }

  topAt(index: number): number {
    if (index <= 0) return 0;
    if (index >= this.size) return this.total;
    const block = this.blockAt(index);
    const offset = index - block.start;
    let top = this.blockTops[block.index];
    for (let i = 0; i < offset; i += 1) top += block.heights[i];
    return top;
  }

  slice(start: number, end: number): Array<{ id: string; top: number }> {
    if (!this.size || start >= end) return [];
    const from = Math.max(0, start);
    const to = Math.min(this.size, end);
    let block = this.blockAt(from);
    let blockIndex = this.blocks.indexOf(block);
    const result: Array<{ id: string; top: number }> = [];
    let global = from;
    let top = this.blockTops[blockIndex];
    for (let offset = 0; offset < from - block.start; offset += 1) top += block.heights[offset];
    while (global < to) {
      if (!block || offsetAt(block, global) >= block.heights.length) {
        blockIndex += 1;
        block = this.blocks[blockIndex];
        if (!block) break;
        top = this.blockTops[blockIndex];
      }
      const offset = global - block.start;
      if (offset >= block.ids.length) break;
      result.push({ id: block.ids[offset], top });
      top += block.heights[offset];
      global += 1;
    }
    return result;
  }

  private blockAt(index: number): Block {
    let low = 0;
    let high = this.blocks.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.blocks[mid].start <= index) low = mid;
      else high = mid - 1;
    }
    return this.blocks[low];
  }

  private rebuildTop(): void {
    let start = 0;
    let total = 0;
    this.blockTops = [0];
    for (let index = 0; index < this.blocks.length; index += 1) {
      const block = this.blocks[index];
      block.index = index;
      block.start = start;
      total += block.sum;
      start += block.ids.length;
      this.blockTops.push(total);
    }
  }
}

function offsetAt(block: Block, index: number): number {
  return index - block.start;
}

function clampHeight(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(100000, value);
}
