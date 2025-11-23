import { WASI, File, OpenFile } from 'https://unpkg.com/@bjorn3/browser_wasi_shim@0.4.2/dist/index.js';

const wasmModuleCache = new Map();

const dataBlobPattern = /^(data:|blob:)/i;
const httpFilePattern = /^(https?:\/\/|file:\/\/)/i;
const pathPattern = /^(\.\.\/|\.\/|\/)/; // relative or absolute path starts

export default class WasmRunner {
    static isValidWasmSource(wasmFile) {
        if (typeof wasmFile !== 'string') return false;
        const trimmed = wasmFile.trim();
        if (!trimmed) return false;

        if (dataBlobPattern.test(trimmed)) return true;

        return httpFilePattern.test(trimmed) || pathPattern.test(trimmed)
    }

    /**
     * Execute a WASM module with the given parameters. The module is expected to run
     * a `main` function, receiving optional command-line arguments and STDIN.
     *
     * @param {string} wasmFile - The WASM file path/URL to load
     * @param {Object} options - Execution options
     * @param {string[]} options.args - Array of command-line arguments
     * @param {string} options.stdin - Content to provide as stdin
     * @returns {Promise<{success: boolean, stdout: string, stderr: string, exitCode: number, stats?: {executionTimeMs: number, compilationTimeMs: number, moduleSizeBytes: number, memoryPages: number|null, memoryBytes: number|null}, error?: Error}>}
     */
    async execute(wasmFile, options = {}) {
        if (!WasmRunner.isValidWasmSource(wasmFile)) {
            return {
                success: false,
                stdout: '',
                stderr: '',
                exitCode: -1,
                error: new Error(`Invalid wasmFile '${wasmFile}'. Must be a non-empty URL/path/filename referencing a .wasm module.`)
            };
        }

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

            const compileStart = performance.now();
            const module = await WebAssembly.instantiate(wasmBytes, {
                wasi_snapshot_preview1: wasi.wasiImport,
            });
            const compileEnd = performance.now();

            const execStart = performance.now();
            const exitCode = wasi.start(module.instance);
            const execEnd = performance.now();

            const stdout = new TextDecoder().decode(stdoutFile.data);
            const stderr = new TextDecoder().decode(stderrFile.data);

            let memoryPages = null;
            let memoryBytes = null;
            if (module.instance.exports.memory) {
                const memory = module.instance.exports.memory;
                memoryBytes = memory.buffer.byteLength;
                memoryPages = memoryBytes / 65536;
            }

            return {
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
