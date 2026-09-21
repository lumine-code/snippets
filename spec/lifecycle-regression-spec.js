const { Disposable } = require("lumine");
const path = require("path");

describe("snippets lifecycle", () => {
  let Snippets, loadAll;

  beforeEach(async () => {
    await lumine.packages.deactivatePackage("snippets");
    Snippets = require("../lib/snippets");
    loadAll = Snippets.loadAll;
    spyOn(Snippets, "loadAll");
    spyOn(Snippets, "getUserSnippetsPath").and.returnValue("");
    spyOn(Snippets, "watchUserSnippets").and.callFake((callback) => callback(new Disposable()));
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("snippets");
  });

  it("rebuilds dynamic command ownership on every activation", async () => {
    const editor = await lumine.workspace.open(path.join(__dirname, "fixtures", "sample.js"));
    await lumine.packages.activatePackage("language-javascript");
    await lumine.packages.activatePackage("language-python");
    await lumine.packages.activatePackage("language-html");
    await lumine.packages.activatePackage("snippets");
    Snippets.doneLoading();
    expect(Snippets.loaded).toBe(true);

    await lumine.packages.deactivatePackage("snippets");
    expect(lumine.packages.getPackageLifecycleState("snippets")).toBe("loaded");

    await lumine.packages.activatePackage("snippets");
    expect(Snippets.loaded).toBe(false);

    await lumine.packages.deactivatePackage("snippets");
    await lumine.packages.activatePackage("snippets");
    expect(Snippets.loaded).toBe(false);
    editor.destroy();
  });

  it("invalidates an aborted load before its pending callbacks can publish", async () => {
    const controller = new AbortController();
    const generation = 100;
    Snippets.activationGeneration = generation;
    let finishBundledLoad;
    spyOn(Snippets, "loadBundledSnippets").and.callFake(
      (callback) => (finishBundledLoad = callback),
    );
    spyOn(Snippets, "loadPackageSnippets");
    spyOn(Snippets, "doneLoading");

    const loading = loadAll.call(Snippets, generation, controller.signal);
    controller.abort();

    expect(await loading).toBe(false);
    expect(Snippets.activationGeneration).toBe(generation + 1);
    finishBundledLoad({ "/old/snippets.json": { ".source.js": {} } });
    expect(Snippets.loadPackageSnippets).not.toHaveBeenCalled();
    expect(Snippets.doneLoading).not.toHaveBeenCalled();
  });
});
