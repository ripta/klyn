import { WASI, File, OpenFile } from 'https://unpkg.com/@bjorn3/browser_wasi_shim@0.4.2/dist/index.js';

self.onmessage = async function(e) {
    const { wasmFile, args = [], stdin = '' } = e.data;

    let stdoutFile = null;
    let stderrFile = null;
    let stdoutOffset = 0;
    let stderrOffset = 0;
    let startTime = performance.now();

    function pollOutput() {
        let hasUpdate = false;
        const elapsedMs = performance.now() - startTime;

        if (stdoutFile && stdoutFile.data.byteLength > stdoutOffset) {
            const newStdoutBytes = stdoutFile.data.slice(stdoutOffset);
            stdoutOffset = stdoutFile.data.byteLength;

            let stdout = new TextDecoder().decode(newStdoutBytes);
            stdout = stdout.replace(/\r/g, '\n');

            hasUpdate = true;
            self.postMessage({
                type: 'progress',
                stdout,
                stderr: '',
                elapsedMs
            });
        }

        if (stderrFile && stderrFile.data.byteLength > stderrOffset) {
            const newStderrBytes = stderrFile.data.slice(stderrOffset);
            stderrOffset = stderrFile.data.byteLength;

            let stderr = new TextDecoder().decode(newStderrBytes);
            stderr = stderr.replace(/\r/g, '\n');

            hasUpdate = true;
            self.postMessage({
                type: 'progress',
                stdout: '',
                stderr,
                elapsedMs
            });
        }

        if (!hasUpdate) {
            self.postMessage({
                type: 'progress',
                stdout: '',
                stderr: '',
                elapsedMs
            });
        }
    }

    try {
        const response = await fetch(wasmFile);
        if (!response.ok) {
            throw new Error(`Failed to load ${wasmFile}: ${response.statusText}`);
        }
        const wasmBytes = await response.arrayBuffer();

        const stdinBytes = new TextEncoder().encode(stdin);
        const stdinFile = new File(stdinBytes);
        stdoutFile = new File([]);
        stderrFile = new File([]);

        const originalStdoutOpenFile = new OpenFile(stdoutFile);
        const stdoutOpenFile = new Proxy(originalStdoutOpenFile, {
            get(target, prop) {
                if (prop === 'fd_write') {
                    return function(...args) {
                        const result = target.fd_write.apply(target, args);
                        if (stdoutFile.data.byteLength > stdoutOffset) {
                            const newStdoutBytes = stdoutFile.data.slice(stdoutOffset);
                            stdoutOffset = stdoutFile.data.byteLength;

                            let stdout = new TextDecoder().decode(newStdoutBytes);
                            stdout = stdout.replace(/\r/g, '\n');

                            self.postMessage({
                                type: 'progress',
                                stdout,
                                stderr: '',
                                elapsedMs: performance.now() - startTime
                            });
                        }
                        return result;
                    };
                }
                return target[prop];
            }
        });

        const originalStderrOpenFile = new OpenFile(stderrFile);
        const stderrOpenFile = new Proxy(originalStderrOpenFile, {
            get(target, prop) {
                if (prop === 'fd_write') {
                    return function(...args) {
                        const result = target.fd_write.apply(target, args);
                        if (stderrFile.data.byteLength > stderrOffset) {
                            const newStderrBytes = stderrFile.data.slice(stderrOffset);
                            stderrOffset = stderrFile.data.byteLength;

                            let stderr = new TextDecoder().decode(newStderrBytes);
                            stderr = stderr.replace(/\r/g, '\n');

                            self.postMessage({
                                type: 'progress',
                                stdout: '',
                                stderr,
                                elapsedMs: performance.now() - startTime
                            });
                        }
                        return result;
                    };
                }
                return target[prop];
            }
        });

        const wasi = new WASI([wasmFile, ...args], [], [
            new OpenFile(stdinFile),
            stdoutOpenFile,
            stderrOpenFile
        ]);

        const compileStart = performance.now();
        const module = await WebAssembly.instantiate(wasmBytes, {
            wasi_snapshot_preview1: wasi.wasiImport,
        });
        const compileEnd = performance.now();

        self.postMessage({
            type: 'started',
            startTime: performance.now()
        });

        const execStart = performance.now();
        const exitCode = wasi.start(module.instance);
        const execEnd = performance.now();

        pollOutput();

        const stdout = new TextDecoder().decode(stdoutFile.data);
        const stderr = new TextDecoder().decode(stderrFile.data);

        let memoryPages = null;
        let memoryBytes = null;
        if (module.instance.exports.memory) {
            const memory = module.instance.exports.memory;
            memoryBytes = memory.buffer.byteLength;
            memoryPages = memoryBytes / 65536;
        }

        self.postMessage({
            type: 'complete',
            success: true,
            stdout,
            stderr,
            exitCode,
            stats: {
                executionTimeMs: execEnd - execStart,
                compilationTimeMs: compileEnd - compileStart,
                moduleSizeBytes: wasmBytes.byteLength,
                memoryPages,
                memoryBytes
            }
        });

    } catch (error) {

        self.postMessage({
            type: 'complete',
            success: false,
            stdout: '',
            stderr: '',
            exitCode: -1,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
};

