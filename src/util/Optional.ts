/** A tiny Option/Maybe type to avoid `null` plumbing in tree-walking code. */
export class Optional<T> {
  private constructor(private readonly tag: boolean, private readonly value?: T) {}

  static some<T>(value: T): Optional<T> {
    return new Optional<T>(true, value);
  }

  static none<T = never>(): Optional<T> {
    return NONE as Optional<T>;
  }

  static from<T>(value: T | null | undefined): Optional<NonNullable<T>> {
    return value === null || value === undefined ? Optional.none() : Optional.some(value as NonNullable<T>);
  }

  isSome(): boolean {
    return this.tag;
  }

  isNone(): boolean {
    return !this.tag;
  }

  map<U>(f: (v: T) => U): Optional<U> {
    return this.tag ? Optional.some(f(this.value as T)) : Optional.none();
  }

  bind<U>(f: (v: T) => Optional<U>): Optional<U> {
    return this.tag ? f(this.value as T) : Optional.none();
  }

  filter(pred: (v: T) => boolean): Optional<T> {
    return this.tag && pred(this.value as T) ? this : Optional.none();
  }

  exists(pred: (v: T) => boolean): boolean {
    return this.tag && pred(this.value as T);
  }

  forall(pred: (v: T) => boolean): boolean {
    return !this.tag || pred(this.value as T);
  }

  fold<U>(onNone: () => U, onSome: (v: T) => U): U {
    return this.tag ? onSome(this.value as T) : onNone();
  }

  getOr(fallback: T): T {
    return this.tag ? (this.value as T) : fallback;
  }

  getOrThunk(f: () => T): T {
    return this.tag ? (this.value as T) : f();
  }

  getOrNull(): T | null {
    return this.tag ? (this.value as T) : null;
  }

  getOrUndefined(): T | undefined {
    return this.value;
  }

  getOrDie(msg?: string): T {
    if (!this.tag) {
      throw new Error(msg ?? 'Called getOrDie on none');
    }
    return this.value as T;
  }

  or(other: Optional<T>): Optional<T> {
    return this.tag ? this : other;
  }

  orThunk(f: () => Optional<T>): Optional<T> {
    return this.tag ? this : f();
  }

  each(f: (v: T) => void): void {
    if (this.tag) {
      f(this.value as T);
    }
  }

  toArray(): T[] {
    return this.tag ? [this.value as T] : [];
  }
}

const NONE = new (Optional as any)(false) as Optional<never>;
