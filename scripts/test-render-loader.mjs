// Module loader hook used by `npm run test:render` to ignore CSS imports.
// Vite handles `import "./Foo.css"` natively, but node:test does not, so
// the test runner needs a hook that returns an empty module for any
// `.css` specifier. Without this hook the React component imports throw.
export function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default {};",
    };
  }
  return nextLoad(url, context);
}
