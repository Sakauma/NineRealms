/* Optional Tauri transport. Browser and Electron keep their existing web APIs. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.NineRealmsDesktop = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  function isTauri() { return !!(root.__TAURI_INTERNALS__ && root.__TAURI__ && root.__TAURI__.core && typeof root.__TAURI__.core.invoke === "function"); }
  async function copyText(text) {
    if (typeof text !== "string") throw new TypeError("Invalid clipboard text");
    if (isTauri()) return root.__TAURI__.core.invoke("copy_text", { text: text });
    if (!root.navigator || !root.navigator.clipboard || !root.navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
    return root.navigator.clipboard.writeText(text);
  }
  async function saveJSON(contents, filename) {
    if (!isTauri()) throw new Error("Native save unavailable");
    if (typeof contents !== "string" || typeof filename !== "string") throw new TypeError("Invalid export");
    var result = await root.__TAURI__.core.invoke("save_json", { contents: contents, filename: filename });
    if (typeof result !== "boolean") throw new Error("Invalid save response");
    return result;
  }
  return Object.freeze({ isTauri: isTauri, copyText: copyText, saveJSON: saveJSON });
});
