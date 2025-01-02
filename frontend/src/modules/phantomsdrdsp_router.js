import { __wbg_set_wasm } from "./phantomsdrdsp_bg.js";
// https://stackoverflow.com/questions/47879864/how-can-i-check-if-a-browser-supports-webassembly
const hasWasm = (() => {
    try {
      if (typeof WebAssembly === 'object' &&
              typeof WebAssembly.instantiate === 'function') {
        const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
        if (module instanceof WebAssembly.Module) { return new WebAssembly.Instance(module) instanceof WebAssembly.Instance }
      }
    } catch (e) {
    }
    return false
})()
//let wasm;
/*if (hasWasm) {
    wasm = await import("./phantomsdrdsp_bg.wasm");
} else {
    wasm = await import("./phantomsdrdsp_bg_fallback.js");
}*/
import * as wasm from "./phantomsdrdsp_bg_fallback.js";
__wbg_set_wasm(wasm);
export * from "./phantomsdrdsp_bg.js";

wasm.__wbindgen_start();
