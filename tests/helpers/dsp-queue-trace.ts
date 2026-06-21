type DspOperation = { key: string; val: string };
type CallLog = Array<[string, ...unknown[]]>;

export function queuedDspOperations(S: { pendingDefaultSetParams: DspOperation[] }) {
  return [...S.pendingDefaultSetParams];
}

export function directSetParamCalls(log: CallLog): DspOperation[] {
  return log
    .filter(([name]) => name === "setParam")
    .map(([, key, val]) => ({ key: String(key), val: String(val) }));
}

export function traceDspWrites(
  S: { pendingDefaultSetParams: DspOperation[] },
  log: CallLog,
) {
  return {
    directSetParams: directSetParamCalls(log),
    queuedOperations: queuedDspOperations(S),
  };
}
