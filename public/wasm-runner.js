const dataBlobPattern = /^(data:|blob:)/i;

export default class WasmRunner {
    constructor() {
        this.worker = null;
        this.progressInterval = null;
    }

    static isValidWasmSource(wasmFile) {
        if (typeof wasmFile !== 'string') return false;
        const trimmed = wasmFile.trim();
        if (!trimmed) return false;

        if (dataBlobPattern.test(trimmed)) return true;

        return trimmed.length > 0;
    }

    /**
     * Execute a WASM module with the given parameters. The module is expected to run
     * a `main` function, receiving optional command-line arguments and STDIN.
     *
     * @param {string} wasmFile - The WASM file path/URL to load
     * @param {Object} options - Execution options
     * @param {string[]} options.args - Array of command-line arguments
     * @param {string} options.stdin - Content to provide as stdin
     * @param {Function} options.onStdout - Callback for incremental stdout chunks
     * @param {Function} options.onStderr - Callback for incremental stderr chunks
     * @param {Function} options.onProgress - Callback for elapsed time updates
     * @returns {Promise<{success: boolean, stdout: string, stderr: string, exitCode: number, stats?: {executionTimeMs: number, compilationTimeMs: number, moduleSizeBytes: number, memoryPages: number|null, memoryBytes: number|null}, error?: Error}>}
     */
    async execute(wasmFile, options = {}) {
        if (!WasmRunner.isValidWasmSource(wasmFile)) {
            return {
                success: false,
                stdout: '',
                stderr: '',
                exitCode: -1,
                error: new Error(`Invalid WASM module URL '${wasmFile}'. Must be a non-empty URL/path/filename referencing a .wasm module.`)
            };
        }

        const { args = [], stdin = '', onStdout, onStderr, onProgress } = options;

        this.cancel();

        this.worker = new Worker('./wasm-worker.js', { type: 'module' });

        let executionStartTime = null;

        return new Promise((resolve) => {
            this.worker.onmessage = (e) => {
                const { type } = e.data;

                if (type === 'started') {
                    executionStartTime = performance.now();

                    if (onProgress) {
                        this.progressInterval = setInterval(() => {
                            const elapsedMs = performance.now() - executionStartTime;
                            onProgress(elapsedMs);
                        }, 100);
                    }

                } else if (type === 'progress') {
                    const { stdout, stderr, elapsedMs } = e.data;
                    if (stdout && onStdout) {
                        onStdout(stdout);
                    }
                    if (stderr && onStderr) {
                        onStderr(stderr);
                    }
                    if (onProgress) {
                        onProgress(elapsedMs);
                    }

                } else if (type === 'complete') {
                    const { success, stdout, stderr, exitCode, stats, error } = e.data;

                    if (this.progressInterval) {
                        clearInterval(this.progressInterval);
                        this.progressInterval = null;
                    }

                    this.worker.terminate();
                    this.worker = null;

                    if (success) {
                        resolve({
                            success: true,
                            stdout,
                            stderr,
                            exitCode,
                            stats
                        });
                    } else {
                        const err = new Error(error.message);
                        err.stack = error.stack;

                        resolve({
                            success: false,
                            stdout: '',
                            stderr: '',
                            exitCode: -1,
                            error: err
                        });
                    }
                }
            };

            this.worker.onerror = (error) => {
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }

                this.worker.terminate();
                this.worker = null;

                resolve({
                    success: false,
                    stdout: '',
                    stderr: '',
                    exitCode: -1,
                    error: new Error(`Worker error: ${error.message}`)
                });
            };

            this.worker.postMessage({
                wasmFile,
                args,
                stdin
            });
        });
    }

    /**
     * Cancel the currently running execution
     */
    cancel() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }

    static parseArguments(argsString) {
        return argsString.trim().split(/\s+/).filter(arg => arg.length > 0);
    }
}
