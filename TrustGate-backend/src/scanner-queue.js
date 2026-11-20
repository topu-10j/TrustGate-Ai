export function createScannerQueue(run, { concurrency = 4, maxPending = 32, waitMs = 8000 } = {}) {
  const pending = [];
  let active = 0;

  function drain() {
    while (active < concurrency && pending.length) {
      const job = pending.shift();
      clearTimeout(job.timer);
      active++;
      const finish = (settle, result) => {
        active--;
        settle(result);
        drain();
      };
      void Promise.resolve().then(() => run(job.input)).then(
        result => finish(job.resolve, result),
        failure => finish(job.reject, failure)
      );
    }
  }

  return (input) => new Promise((resolve, reject) => {
    if (active >= concurrency && pending.length >= maxPending) return reject(new Error("Scanner queue is full"));
    const job = { input, resolve, reject, timer: null };
    if (active >= concurrency) {
      job.timer = setTimeout(() => {
        const index = pending.indexOf(job);
        if (index === -1) return;
        pending.splice(index, 1);
        reject(new Error("Scanner queue wait timed out"));
      }, waitMs);
    }
    pending.push(job);
    drain();
  });
}
