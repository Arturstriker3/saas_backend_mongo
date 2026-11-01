const SCRIPTS = ['dev:core', 'dev:workerEmail', 'dev:workerGeo'];

async function run() {
  const processes = SCRIPTS.map((script) =>
    Bun.spawn(['bun', 'run', script], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    }),
  );

  const stopAll = () => {
    for (const child of processes) child.kill();
  };

  process.on('SIGINT', () => {
    stopAll();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopAll();
    process.exit(0);
  });

  const exitCodes = await Promise.all(processes.map((child) => child.exited));
  if (exitCodes.some((code) => code !== 0)) process.exit(1);
}

run();
