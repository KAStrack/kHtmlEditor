export class Cell<T> {
  constructor(private value: T) {}
  get(): T {
    return this.value;
  }
  set(v: T): void {
    this.value = v;
  }
}
