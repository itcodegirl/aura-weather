// Test-only module hook that makes a chosen module's import() reject, so a
// render test can reproduce a lazy chunk that fails to load. Vite's chunk
// fetch has no equivalent in node:test, and a component's own code cannot be
// asked to fail from the outside, so the failure is injected at module load.
//
// Register it alongside render-test-setup.mjs and pass the module paths to
// break through register()'s `data` — module hooks run on their own thread, so
// they cannot read the test file's variables:
//
//   register("../../../scripts/render-test-fail-module-loader.mjs",
//     import.meta.url, { data: { brokenSuffixes: ["/Foo.jsx"] } });

let brokenSuffixes = [];

export function initialize(data) {
  brokenSuffixes = Array.isArray(data?.brokenSuffixes) ? data.brokenSuffixes : [];
}

export async function load(url, context, nextLoad) {
  const broken = brokenSuffixes.find((suffix) => url.endsWith(suffix));
  if (broken) {
    const message = JSON.stringify(`Simulated chunk load failure: ${broken}`);
    return {
      format: "module",
      shortCircuit: true,
      source: `throw new Error(${message});`,
    };
  }

  return nextLoad(url, context);
}
