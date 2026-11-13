/**
 * 可直接替换 apps/web/src/heightIndex.ts 的 O(log n) 增量行高索引。
 *
 * 与现有 SqrtHeightIndex 的公共 API 完全一致：
 *   size / total / reset / append / prepend / update / locate / topAt / slice
 * ChatPage.tsx 只需把 import 指向本文件，其余代码不用改。
 *
 * 核心：两棵可增长 Fenwick 树（树状数组，1994 年提出，几乎所有竞赛/工业虚拟列表都在用）。
 *   - tail：按时间顺序追加的新消息，append = push，O(log n)。
 *   - head：加载「更早一页」时前插的旧消息，按【显示顺序的倒序】存放，
 *           于是 prepend 也退化为 push，O(k log n)，彻底避免 unshift + 全量重算。
 *   - byId 存块内偏移，update 只做一次点更新，O(log n)。
 *
 * 复杂度对照（n = 消息数，B = 块大小 64）：
 *                     现有 SqrtHeightIndex   本实现
 *   append                O(n/B)            O(log n)
 *   prepend(k 条)         O(n/B + k)        O(k log n)
 *   update                 O(n/B)           O(log n)
 *   locate                 O(n/B)           O(log n)
 *   topAt / slice(start,end) O(n/B + 窗口)   O(log n + 窗口·log n)
 *
 * 稳定性：不依赖任何浏览器新 API、不依赖 V8 内部快路径，ES2017 语法即可运行；
 *         Fenwick 是数据结构教科书内容，不存在「框架淘汰」风险。
 *
 * 不变量：所有行高经 clampHeight 归一化为 >= 1，保证前缀和严格单调，lowerBound 才成立。
 */
type Zone = "head" | "tail";
type Position = { zone: Zone; offset: number };

class Fenwick {
  private tree: number[] = [0]; // 1-indexed
  private count = 0;

  get size(): number { return this.count; }

  /** 尾部追加 O(log n)。不能用 add()：高层节点必须按 lowbit 重建。 */
  push(value: number): void {
    this.count += 1;
    const i = this.count;
    let node = value;
    const low = i & -i;
    for (let step = 1; step < low; step <<= 1) node += this.tree[i - step] || 0;
    this.tree[i] = node;
  }

  add(index: number, delta: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new RangeError("Fenwick.add: index out of range");
    }
    for (let k = index + 1; k <= this.count; k += k & -k) this.tree[k] += delta;
  }

  /** 前 count 个元素之和，O(log n)。 */
  prefix(count: number): number {
    let sum = 0;
    for (let k = Math.min(count, this.count); k > 0; k -= k & -k) sum += this.tree[k];
    return sum;
  }

  total(): number { return this.prefix(this.count); }

  at(index: number): number { return this.prefix(index + 1) - this.prefix(index); }

  /** 最小的 index 使 prefix(index + 1) > target，O(log n)。 */
  lowerBound(target: number): number {
    let index = 0;
    let bit = 1;
    while ((bit << 1) <= this.count) bit <<= 1;
    let acc = 0;
    for (let step = bit; step > 0; step >>= 1) {
      const next = index + step;
      if (next <= this.count && acc + this.tree[next] <= target) {
        index = next;
        acc += this.tree[next];
      }
    }
    return index;
  }
}

export function clampHeight(value: number): number {
  const height = Number(value);
  if (!Number.isFinite(height) || height <= 0) return 1;
  return Math.min(100000, height);
}

export class SqrtHeightIndex {
  private headTree = new Fenwick();   // 倒序存放 head 区
  private tailTree = new Fenwick();
  private headIds: string[] = [];      // 索引 j => 显示顺序中第 (headCount-1-j) 条
  private tailIds: string[] = [];
  private byId = new Map<string, Position>();

  get size(): number { return this.headIds.length + this.tailIds.length; }
  get total(): number { return this.headTotal() + this.tailTree.total(); }
  private headCount(): number { return this.headIds.length; }
  private headTotal(): number { return this.headTree.total(); }

  reset(): void {
    this.headTree = new Fenwick();
    this.tailTree = new Fenwick();
    this.headIds = [];
    this.tailIds = [];
    this.byId.clear();
  }

  append(id: string, height: number): void {
    if (this.byId.has(id)) { this.update(id, height); return; }
    const h = clampHeight(height);
    this.byId.set(id, { zone: "tail", offset: this.tailIds.length });
    this.tailIds.push(id);
    this.tailTree.push(h);
  }

  /** entries 必须按显示顺序（旧 -> 新）传入；已存在的 id 会被忽略。 */
  prepend(entries: Array<{ id: string; height: number }>): void {
    const fresh = entries.filter((entry) => entry && !this.byId.has(entry.id));
    if (!fresh.length) return;
    // 新行比现有所有 head 行更旧；倒序数组把「最旧」放到末尾，因此仍是 push。
    for (let i = fresh.length - 1; i >= 0; i -= 1) {
      const entry = fresh[i];
      this.byId.set(entry.id, { zone: "head", offset: this.headIds.length });
      this.headIds.push(entry.id);
      this.headTree.push(clampHeight(entry.height));
    }
  }

  update(id: string, height: number): boolean {
    const position = this.byId.get(id);
    if (!position) return false;
    const next = clampHeight(height);
    const tree = position.zone === "head" ? this.headTree : this.tailTree;
    const previous = tree.at(position.offset);
    if (Math.abs(previous - next) < 1) return false;
    tree.add(position.offset, next - previous);
    return true;
  }

  /** 给定 scrollTop，返回第一条可见行的全局下标，O(log n)。 */
  locate(target: number): number {
    const size = this.size;
    if (!size || target <= 0) return 0;
    if (target >= this.total) return size - 1;
    const headTotal = this.headTotal();
    if (target < headTotal) {
      const m = this.headCount();
      // top(i) = headTotal - prefix(m - i)；求最大的 i 使 top(i) <= target。
      // lowerBound 返回 0-based 行号 j（prefix(j+1) > t），元素个数 k = j + 1。
      const k = this.headTree.lowerBound(headTotal - target - 1e-9) + 1;
      return Math.max(0, Math.min(m - 1, m - k));
    }
    const inner = this.tailTree.lowerBound(target - headTotal);
    return Math.min(size - 1, this.headCount() + inner);
  }

  /** 给定全局下标，返回其顶部像素，O(log n)。 */
  topAt(index: number): number {
    const size = this.size;
    if (index <= 0) return 0;
    if (index >= size) return this.total;
    const m = this.headCount();
    const headTotal = this.headTotal();
    if (index < m) return headTotal - this.headTree.prefix(m - index);
    return headTotal + this.tailTree.prefix(index - m);
  }

  slice(start: number, end: number): Array<{ id: string; top: number }> {
    const size = this.size;
    if (!size || start >= end) return [];
    const from = Math.max(0, start);
    const to = Math.min(size, end);
    const m = this.headCount();
    const result: Array<{ id: string; top: number }> = [];
    let top = this.topAt(from);
    for (let i = from; i < to; i += 1) {
      let id: string, height: number;
      if (i < m) {
        const j = m - 1 - i;
        id = this.headIds[j];
        height = this.headTree.at(j);
      } else {
        const j = i - m;
        id = this.tailIds[j];
        height = this.tailTree.at(j);
      }
      result.push({ id, top });
      top += height;
      // head 区跨到 tail 区时，top 由累加自然衔接，无需重算
    }
    return result;
  }
}
