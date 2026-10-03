const path = require("path");

describe("Snippet autocomplete", () => {
  let snippets, provider, autocomplete, editor, editorElement, scopeDescriptor;

  const addTestSnippets = () => {
    snippets.add("autocomplete-spec.json", {
      ".source.js": {
        "Loop snippet": {
          prefix: "zzdo",
          body: "do {\n\t${1:work};\n} while (${2:true});$0",
          leftLabel: "loop",
          rightLabelHTML: "<b>Loop</b>",
          description: "Repeat a block.",
          descriptionMoreURL: "https://example.com/loop",
        },
        "Later prefix": { prefix: "zzad", body: "later" },
        "First prefix": { prefix: "zza", body: "first" },
        "Middle prefix": { prefix: "zzab", body: "middle" },
        "Command snippet": { command: "autocomplete-test-command", body: "command only" },
      },
      ".source.python": {
        "Python snippet": { prefix: "zzpython", body: "python only" },
      },
    });
  };

  beforeEach(async () => {
    await lumine.packages.deactivatePackage("snippets");
    lumine.config.set("snippets.enableAutocomplete", true);
    lumine.config.set("autocomplete.enableBuiltinProvider", false);
    lumine.config.set("autocomplete.enableAutoActivation", true);
    lumine.config.set("autocomplete.autoActivationDelay", 100);

    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    await lumine.packages.activatePackage("language-javascript");
    editor = await lumine.workspace.open(path.join(__dirname, "fixtures", "sample.js"));
    editorElement = lumine.views.getView(editor);
    await editor.getBuffer().getLanguageMode().ready;
    editor.setText("");
    scopeDescriptor = editor.getLastCursor().getScopeDescriptor();

    const pack = await lumine.packages.activatePackage("snippets");
    snippets = pack.mainModule;
    await snippets.waitForSnippetsLoaded();
    addTestSnippets();
    provider = snippets.provideAutocomplete();
    autocomplete = (await lumine.packages.activatePackage("autocomplete")).mainModule;
    editorElement.focus();
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("autocomplete");
    await lumine.packages.deactivatePackage("snippets");
    editor.destroy();
  });

  it("offers scoped prefixes in alphabetical order with their metadata", async () => {
    const suggestions = await provider.getSuggestions({ scopeDescriptor, prefix: "ZZ" });
    const testSuggestions = suggestions.filter((suggestion) => suggestion.text.startsWith("zz"));
    expect(testSuggestions.map((suggestion) => suggestion.text)).toEqual([
      "zza",
      "zzab",
      "zzad",
      "zzdo",
    ]);
    expect(testSuggestions.at(-1)).toEqual({
      type: "snippet",
      text: "zzdo",
      replacementPrefix: "ZZ",
      rightLabel: "Loop snippet",
      rightLabelHTML: "<b>Loop</b>",
      leftLabel: "loop",
      leftLabelHTML: undefined,
      description: "Repeat a block.",
      descriptionMoreURL: "https://example.com/loop",
    });
    expect(await provider.getSuggestions({ scopeDescriptor, prefix: "" })).toEqual([]);
  });

  it("does not offer command-only snippets as prefixes", async () => {
    const suggestions = await provider.getSuggestions({ scopeDescriptor, prefix: "c" });
    expect(suggestions.every((suggestion) => typeof suggestion.text === "string")).toBe(true);
    expect(suggestions.some((suggestion) => suggestion.rightLabel === "Command snippet")).toBe(
      false,
    );
  });

  it("shows suggestions and expands the confirmed snippet with live tab stops", async () => {
    expect(autocomplete.autocompleteManager.providerManager.isProviderRegistered(provider)).toBe(
      true,
    );
    for (const character of "zzdo") editor.insertText(character);
    advanceClock(200);
    await conditionPromise(
      () => editorElement.querySelector(".autocomplete span.word"),
      "snippet suggestion to appear",
      3000,
    );
    expect(editorElement.querySelector(".autocomplete span.word")).toHaveText("zzdo");
    expect(editorElement.querySelector(".autocomplete span.right-label")).toHaveText("Loop");

    lumine.commands.dispatch(editorElement, "autocomplete:confirm");
    expect(editor.getText()).toContain("} while (true)");
    expect(editor.getSelectedText()).toBe("work");
    lumine.commands.dispatch(editorElement, "snippets:next-tab-stop");
    expect(editor.getSelectedText()).toBe("true");
  });

  it("toggles suggestions independently of prefix expansion", async () => {
    lumine.config.set("snippets.enableAutocomplete", false);
    expect(await provider.getSuggestions({ scopeDescriptor, prefix: "zz" })).toEqual([]);

    editor.setText("zzdo");
    editor.moveToEndOfLine();
    lumine.commands.dispatch(editorElement, "snippets:expand");
    expect(editor.getText()).toContain("} while (true)");

    lumine.config.set("snippets.enableAutocomplete", true);
    expect((await provider.getSuggestions({ scopeDescriptor, prefix: "zz" })).length).toBe(4);
  });

  it("discards suggestions requested before the package is deactivated", async () => {
    let finishLoading;
    spyOn(snippets, "waitForSnippetsLoaded").and.returnValue(
      new Promise((resolve) => (finishLoading = resolve)),
    );
    const suggestions = provider.getSuggestions({ scopeDescriptor, prefix: "zz" });
    await lumine.packages.deactivatePackage("snippets");
    finishLoading(true);
    expect(await suggestions).toEqual([]);
    expect(autocomplete.autocompleteManager.providerManager.isProviderRegistered(provider)).toBe(
      false,
    );
  });

  it("waits for the snippet scan before answering a request", async () => {
    let finishLoading;
    snippets.loaded = false;
    snippets.loadingPromise = new Promise((resolve) => (finishLoading = resolve));
    let settled = false;
    const suggestions = provider.getSuggestions({ scopeDescriptor, prefix: "zz" });
    suggestions.then(() => (settled = true));
    await flushMicrotasks();
    expect(settled).toBe(false);

    snippets.doneLoading();
    finishLoading(true);
    expect((await suggestions).length).toBe(4);
  });

  it("replaces the provider when snippets is reactivated", async () => {
    const oldProvider = provider;
    await lumine.packages.deactivatePackage("snippets");
    expect(autocomplete.autocompleteManager.providerManager.isProviderRegistered(oldProvider)).toBe(
      false,
    );

    snippets = (await lumine.packages.activatePackage("snippets")).mainModule;
    await snippets.waitForSnippetsLoaded();
    addTestSnippets();
    provider = snippets.provideAutocomplete();
    expect(provider).not.toBe(oldProvider);
    expect(autocomplete.autocompleteManager.providerManager.isProviderRegistered(provider)).toBe(
      true,
    );
    expect(await oldProvider.getSuggestions({ scopeDescriptor, prefix: "zz" })).toEqual([]);
    expect((await provider.getSuggestions({ scopeDescriptor, prefix: "zz" })).length).toBe(4);
  });

  it("registers the same provider again after autocomplete is reactivated", async () => {
    await lumine.packages.deactivatePackage("autocomplete");
    editor.setText("zzdo");
    editor.moveToEndOfLine();
    lumine.commands.dispatch(editorElement, "snippets:expand");
    expect(editor.getSelectedText()).toBe("work");

    autocomplete = (await lumine.packages.activatePackage("autocomplete")).mainModule;
    expect(autocomplete.autocompleteManager.providerManager.isProviderRegistered(provider)).toBe(
      true,
    );
    expect((await provider.getSuggestions({ scopeDescriptor, prefix: "zz" })).length).toBe(4);
  });
});
