import { WASI, File, OpenFile } from 'https://unpkg.com/@bjorn3/browser_wasi_shim@0.4.2/dist/index.js';

const wasmModuleCache = new Map();

export default class WasmRunner {
    /**
     * Execute a WASM module with the given parameters.
     *
     * @param {string} wasmFile - The WASM file path/URL to load
     * @param {Object} options - Execution options
     * @param {string[]} options.args - Array of command-line arguments
     * @param {string} options.stdin - Content to provide as stdin
     * @returns {Promise<{success: boolean, stdout: string, stderr: string, exitCode: number, error?: Error}>}
     */
    async execute(wasmFile, options = {}) {
        const { args = [], stdin = '' } = options;

        try {
            let wasmBytes;
            if (wasmModuleCache.has(wasmFile)) {
                wasmBytes = wasmModuleCache.get(wasmFile);
            } else {
                const response = await fetch(wasmFile);
                if (!response.ok) {
                    throw new Error(`Failed to load ${wasmFile}: ${response.statusText}`);
                }
                wasmBytes = await response.arrayBuffer();
                wasmModuleCache.set(wasmFile, wasmBytes);
            }

            const stdinBytes = new TextEncoder().encode(stdin);
            const stdinFile = new File(stdinBytes);
            const stdoutFile = new File([]);
            const stderrFile = new File([]);

            const wasi = new WASI([wasmFile, ...args], [], [
                new OpenFile(stdinFile),
                new OpenFile(stdoutFile),
                new OpenFile(stderrFile)
            ]);

            const module = await WebAssembly.instantiate(wasmBytes, {
                wasi_snapshot_preview1: wasi.wasiImport,
            });

            const exitCode = wasi.start(module.instance);

            const stdout = new TextDecoder().decode(stdoutFile.data);
            const stderr = new TextDecoder().decode(stderrFile.data);

            return {
                success: true,
                stdout,
                stderr,
                exitCode
            };
        } catch (error) {
            return {
                success: false,
                stdout: '',
                stderr: '',
                exitCode: -1,
                error
            };
        }
    }

    static parseArguments(argsString) {
        return argsString.trim().split(/\s+/).filter(arg => arg.length > 0);
    }
}

