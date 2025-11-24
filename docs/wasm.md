# wasm.html

Klyn `wasm.html` is a client-side WebAssembly (WASM) module runner that
executes WASI-compatible WASM modules directly in the browser.

## How It Works

Access `wasm.html` directly and provide:

1. a path or URL to a `.wasm` file (e.g., `rt_lite.wasm`);
2. optional, space-separated command-line arguments (e.g., `version`); and
3. optional standard input content.

Options may also be specified from the query string:

```
/wasm.html?module=enc.wasm&args=arg1%20arg2
```

Options are saved in local storage for convenience, although options specified in
the query string take precedence.

The runner will then:

1. fetch the WASM module;
2. instantiate it using the browser's WebAssembly API;
3. execute the module's `main` function with WASI support; and
4. display STDOUT and execution statistics.
