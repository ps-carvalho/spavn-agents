let _engine: import("../../engine/index.js").SpavnEngine | null = null;

export async function getEngine(): Promise<import("../../engine/index.js").SpavnEngine> {
  if (!_engine) {
    const { SpavnEngine } = await import("../../engine/index.js");
    _engine = new SpavnEngine();
    _engine.initialize();
  }
  return _engine;
}

/** Reset singleton (for tests) */
export function resetEngine(): void {
  _engine = null;
}
