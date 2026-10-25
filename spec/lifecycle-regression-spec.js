const { Disposable } = require("lumine");
const path = require("path");

describe("snippets lifecycle", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

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

  it("settles deferred indexing when deactivated before the loading microtask", async () => {
    Snippets.activate({ signal: new AbortController().signal });
    const loading = Snippets.loadingPromise;
    let result = "pending";
    loading.then((value) => (result = value));
    Snippets.deactivate();
    await Promise.resolve();
    await Promise.resolve();

    expect(result).toBe(false);
    expect(Snippets.loadAll).not.toHaveBeenCalled();
    expect(Snippets.watchUserSnippets).not.toHaveBeenCalled();
  });

  it("does not start indexing or watching after its activation signal is aborted", async () => {
    const controller = new AbortController();
    Snippets.activate({ signal: controller.signal });
    const loading = Snippets.loadingPromise;
    controller.abort();
    let result = "pending";
    loading.then((value) => (result = value));
    await Promise.resolve();
    await Promise.resolve();
    Snippets.deactivate();

    expect(result).toBe(false);
    expect(Snippets.loadAll).not.toHaveBeenCalled();
    expect(Snippets.watchUserSnippets).not.toHaveBeenCalled();
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
