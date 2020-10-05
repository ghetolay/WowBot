import nodeCleanup from 'node-cleanup';

const callbacks: Set<() => Promise<void>> = new Set();

export function addCleanupCallback(callback: () => Promise<void>) {
    callbacks.add(callback);
    return () => callbacks.delete(callback);
}

nodeCleanup((_, signal) => {
    logger.info('Closing app -- waiting for cleanup...')

    const cleanups: Promise<void>[] = [];
    for (const c of callbacks) {
        // catch cause Promise.all to stop at first rejection
        // and we absolutely want to run all cleanup callbacks
        cleanups.push(c().catch());
    }

    Promise.all(cleanups)
        .then(() => {
            logger.info('Bye Bye.');
            process.kill(process.pid, signal!)
        });

    nodeCleanup.uninstall();
    return false;
})