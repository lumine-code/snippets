const path = require("path");
const fs = require("fs");
const temp = require("@lumine-code/temp").track();
const wait = timeoutPromise;

describe("Snippet Loading", () => {
  let configDirPath, snippetsService;

  beforeEach(async () => {
    configDirPath = temp.mkdirSync("lumine-config-dir-");
    spyOn(lumine, "getConfigDirPath").and.returnValue(configDirPath);

    spyOn(console, "warn");
    if (lumine.notifications != null) {
      spyOn(lumine.notifications, "addError");
    }

    spyOn(lumine.packages, "getLoadedPackages").and.returnValue([
      lumine.packages.loadPackage(path.join(__dirname, "fixtures", "package-with-snippets")),
      lumine.packages.loadPackage(path.join(__dirname, "fixtures", "package-with-broken-snippets")),
    ]);
  });

  afterEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.deactivatePackage("snippets");
    jasmine.unspy(lumine.packages, "getLoadedPackages");
    // Give `pathwatcher` some room to breathe.
    await wait(50);
  });

  // Activates the package and waits for both the module's own load promise and
  // the bundled snippets to be in place.
  async function activateSnippetsPackage() {
    const { mainModule } = await lumine.packages.activatePackage("snippets");
    snippetsService = mainModule.provideSnippets();
    mainModule.loaded = false;
    await mainModule.waitForSnippetsLoaded();

    await conditionPromise(
      () => snippetsService.bundledSnippetsLoaded(),
      "all snippets to load",
      3000,
    );
  }

  it("loads the bundled snippet template snippets", async () => {
    await activateSnippetsPackage();

    const jsonSnippet = snippetsService.snippetsForScopes([".source.json"])["snip"];
    expect(jsonSnippet.name).toBe("Lumine Snippet");
    expect(jsonSnippet.prefix).toBe("snip");
    expect(jsonSnippet.body).toContain('"prefix":');
    expect(jsonSnippet.body).toContain('"body":');
    expect(jsonSnippet.tabStopList.length).toBeGreaterThan(0);

    const csonSnippet = snippetsService.snippetsForScopes([".source.coffee"])["snip"];
    expect(csonSnippet.name).toBe("Lumine Snippet");
    expect(csonSnippet.prefix).toBe("snip");
    expect(csonSnippet.body).toContain("'prefix':");
    expect(csonSnippet.body).toContain("'body':");
    expect(csonSnippet.tabStopList.length).toBeGreaterThan(0);
  });

  it("loads non-hidden snippet files from lumine packages with snippets directories", async () => {
    await activateSnippetsPackage();

    let snippet = snippetsService.snippetsForScopes([".test"])["test"];
    expect(snippet.prefix).toBe("test");
    expect(snippet.body).toBe("testing 123");

    snippet = snippetsService.snippetsForScopes([".test"])["testd"];
    expect(snippet.prefix).toBe("testd");
    expect(snippet.body).toBe("testing 456");
    expect(snippet.description).toBe("a description");
    expect(snippet.descriptionMoreURL).toBe("http://google.com");

    snippet = snippetsService.snippetsForScopes([".test"])["testlabelleft"];
    expect(snippet.prefix).toBe("testlabelleft");
    expect(snippet.body).toBe("testing 456");
    expect(snippet.leftLabel).toBe("a label");

    snippet = snippetsService.snippetsForScopes([".test"])["testhtmllabels"];
    expect(snippet.prefix).toBe("testhtmllabels");
    expect(snippet.body).toBe("testing 456");
    expect(snippet.leftLabelHTML).toBe('<span style="color:red">Label</span>');
    expect(snippet.rightLabelHTML).toBe('<span style="color:white">Label</span>');
  });

  it("registers a command if a package snippet defines one", async () => {
    const { mainModule } = await lumine.packages.activatePackage("snippets");
    await new Promise((resolve) => {
      mainModule.onDidLoadSnippets(resolve);
    });

    expect("package-with-snippets:test-command-name" in lumine.commands.registeredCommands).toBe(
      true,
    );
  });

  it("logs a warning if package snippets files cannot be parsed", async () => {
    await activateSnippetsPackage();

    // Warn about invalid-file, but don't even try to parse a hidden file
    expect(console.warn.calls.count()).toBeGreaterThan(0);
    expect(console.warn.calls.mostRecent().args[0]).toMatch(
      /Error reading.*package-with-broken-snippets/,
    );
  });

  describe("::loadPackageSnippets(callback)", () => {
    const jsPackage = () => {
      const pack = lumine.packages.loadPackage("language-javascript");
      pack.path = path.join(lumine.app.getResourcePath(), "node_modules", "language-javascript");
      return pack;
    };

    beforeEach(async () => {
      // simulate a list of packages where the javascript core package is returned at the end
      lumine.packages.getLoadedPackages.and.returnValue([
        lumine.packages.loadPackage(path.join(__dirname, "fixtures", "package-with-snippets")),
        jsPackage(),
      ]);
    });

    // NOTE: This spec will fail if you're hacking on the Lumine source code
    // with `LUMINE_RESOURCE_PATH`. Just make sure it passes in CI and you'll
    // be fine.
    it("allows other packages to override core packages' snippets", async () => {
      await lumine.packages.activatePackage("language-javascript");

      await activateSnippetsPackage();

      const snippet = snippetsService.snippetsForScopes([".source.js"])["log"];
      expect(snippet.body).toBe("from-a-community-package");
    });
  });

  describe("::onDidLoadSnippets(callback)", () => {
    it("invokes listeners when all snippets are loaded", async () => {
      const { mainModule } = await lumine.packages.activatePackage("snippets");
      const loadedCallback = jasmine.createSpy("onDidLoadSnippets callback");
      mainModule.onDidLoadSnippets(loadedCallback);

      await conditionPromise(
        () => loadedCallback.calls.count() > 0,
        "the onDidLoad callback to be called",
      );
    });
  });

  describe("when ~/.lumine/snippets.json exists", () => {
    let snippet;
    beforeEach(async () => {
      jasmine.useRealClock();
      fs.mkdirSync(configDirPath, { recursive: true });
      fs.writeFileSync(
        path.join(configDirPath, "snippets.json"),
        `\
{
  // JSON comments are supported in user configuration files.
  ".foo": {
    "foo snippet": {
      "prefix": "foo",
      "body": "bar1"
    }
  }
}\
`,
      );
      await activateSnippetsPackage();
    });

    it("loads the snippets from that file", async () => {
      snippet = snippetsService.snippetsForScopes([".foo"])["foo"];

      expect(snippet.name).toBe("foo snippet");
      expect(snippet.prefix).toBe("foo");
      expect(snippet.body).toBe("bar1");
    });

    describe("when that file changes", () => {
      it("reloads the snippets", async () => {
        jasmine.useRealClock();
        fs.mkdirSync(configDirPath, { recursive: true });
        // The user snippets watcher arms asynchronously after activation, so
        // rewrite until the change is observed: a single write could land
        // before the watcher is armed and would never be reported.
        await conditionPromise(() => {
          fs.writeFileSync(
            path.join(configDirPath, "snippets.json"),
            `\
{
".foo": {
  "foo snippet": {
    "prefix": "foo",
    "body": "bar2"
  }
}
}\
`,
          );
          const snippet = snippetsService.snippetsForScopes([".foo"])["foo"];
          return snippet && snippet.body === "bar2";
        }, "snippets to be changed");

        fs.mkdirSync(configDirPath, { recursive: true });
        fs.writeFileSync(path.join(configDirPath, "snippets.json"), "");

        await conditionPromise(() => {
          let result = snippetsService.snippetsForScopes([".foo"])["foo"];
          return !result;
        }, "snippets to be removed");
      });
    });
  });

  describe("when ~/.lumine/snippets.cson exists", () => {
    beforeEach(async () => {
      jasmine.useRealClock();
      fs.mkdirSync(configDirPath, { recursive: true });
      fs.writeFileSync(
        path.join(configDirPath, "snippets.cson"),
        `\
".foo":
  "foo snippet":
    "prefix": "foo"
    "body": "bar1"\
`,
      );
      await activateSnippetsPackage();
    });

    it("loads the snippets from that file", async () => {
      jasmine.useRealClock();
      let snippet;

      await conditionPromise(() => {
        snippet = snippetsService.snippetsForScopes([".foo"])["foo"];
        return snippet;
      });

      expect(snippet.name).toBe("foo snippet");
      expect(snippet.prefix).toBe("foo");
      expect(snippet.body).toBe("bar1");
    });

    describe("when that file changes", () => {
      it("reloads the snippets", async () => {
        fs.mkdirSync(configDirPath, { recursive: true });
        // See the snippets.json twin above: rewrite until observed, because
        // the watcher arms asynchronously after activation.
        await conditionPromise(() => {
          fs.writeFileSync(
            path.join(configDirPath, "snippets.cson"),
            `\
".foo":
  "foo snippet":
    "prefix": "foo"
    "body": "bar2"\
`,
          );
          const snippet = snippetsService.snippetsForScopes([".foo"])["foo"];
          return snippet && snippet.body === "bar2";
        }, "snippets to be changed");

        fs.mkdirSync(configDirPath, { recursive: true });
        fs.writeFileSync(path.join(configDirPath, "snippets.cson"), "");

        await conditionPromise(() => {
          const snippet = snippetsService.snippetsForScopes([".foo"])["foo"];
          return snippet == null;
        }, "snippets to be removed");
      });
    });
  });

  it("notifies the user when the user snippets file cannot be loaded", async () => {
    jasmine.useRealClock();
    fs.writeFileSync(path.join(configDirPath, "snippets.cson"), '".junk":::');

    await activateSnippetsPackage();

    expect(console.warn).toHaveBeenCalled();
    if (lumine.notifications != null) {
      expect(lumine.notifications.addError).toHaveBeenCalled();
    }
  });

  describe("packages-with-snippets-disabled feature", () => {
    it("disables no snippets if the config option is empty", async () => {
      const originalConfig = lumine.config.get("core.packagesWithSnippetsDisabled");
      lumine.config.set("core.packagesWithSnippetsDisabled", []);

      await activateSnippetsPackage();
      const snippets = snippetsService.snippetsForScopes([".package-with-snippets-unique-scope"]);
      expect(Object.keys(snippets).length).toBe(1);
      lumine.config.set("core.packagesWithSnippetsDisabled", originalConfig);
    });

    it("still includes a disabled package's snippets in the list of unparsed snippets", async () => {
      let originalConfig = lumine.config.get("core.packagesWithSnippetsDisabled");
      lumine.config.set("core.packagesWithSnippetsDisabled", []);

      await activateSnippetsPackage();
      lumine.config.set("core.packagesWithSnippetsDisabled", ["package-with-snippets"]);
      const allSnippets = snippetsService.getUnparsedSnippets();
      const scopedSnippet = allSnippets.find(
        (s) => s.selectorString === ".package-with-snippets-unique-scope",
      );
      expect(scopedSnippet).not.toBe(undefined);
      lumine.config.set("core.packagesWithSnippetsDisabled", originalConfig);
    });

    it("never loads a package's snippets when that package is disabled in config", async () => {
      const originalConfig = lumine.config.get("core.packagesWithSnippetsDisabled");
      lumine.config.set("core.packagesWithSnippetsDisabled", ["package-with-snippets"]);

      await activateSnippetsPackage();
      const snippets = snippetsService.snippetsForScopes([".package-with-snippets-unique-scope"]);
      expect(Object.keys(snippets).length).toBe(0);
      lumine.config.set("core.packagesWithSnippetsDisabled", originalConfig);
    });

    it("unloads and/or reloads snippets from a package if the config option is changed after activation", async () => {
      const originalConfig = lumine.config.get("core.packagesWithSnippetsDisabled");
      lumine.config.set("core.packagesWithSnippetsDisabled", []);

      await activateSnippetsPackage();
      let snippets = snippetsService.snippetsForScopes([".package-with-snippets-unique-scope"]);
      expect(Object.keys(snippets).length).toBe(1);

      // Disable it.
      lumine.config.set("core.packagesWithSnippetsDisabled", ["package-with-snippets"]);
      snippets = snippetsService.snippetsForScopes([".package-with-snippets-unique-scope"]);
      expect(Object.keys(snippets).length).toBe(0);

      // Re-enable it.
      lumine.config.set("core.packagesWithSnippetsDisabled", []);
      snippets = snippetsService.snippetsForScopes([".package-with-snippets-unique-scope"]);
      expect(Object.keys(snippets).length).toBe(1);

      lumine.config.set("core.packagesWithSnippetsDisabled", originalConfig);
    });
  });
});
