async function run() {
  const coreProcess = Bun.spawn(['bun', 'run', 'dev:core'], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const workerEmailProcess = Bun.spawn(['bun', 'run', 'dev:workerEmail'], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const stopAll = () => {
    coreProcess.kill();
    workerEmailProcess.kill();
  };

  process.on('SIGINT', () => {
    stopAll();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopAll();
    process.exit(0);
  });

  const [coreExitCode, workerExitCode] = await Promise.all([
    coreProcess.exited,
    workerEmailProcess.exited,
  ]);

  const hasFailure = coreExitCode !== 0 || workerExitCode !== 0;
  if (hasFailure) process.exit(1);
}

run();
