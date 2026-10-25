module.exports = class SnippetsProvider {
  constructor(snippets) {
    this.snippets = snippets;
    this.activationGeneration = snippets.activationGeneration;
    this.scopeSelector = "*";
    this.inclusionPriority = 1;
    this.suggestionPriority = 2;
    this.filterSuggestions = true;
  }

  isAvailable(scopeDescriptor) {
    return (
      this.activationGeneration === this.snippets.activationGeneration &&
      this.snippets.subscriptions != null &&
      lumine.config.get("snippets.enableAutocomplete", { scope: scopeDescriptor }) !== false
    );
  }

  async getSuggestions({ editor, scopeDescriptor, prefix, signal }) {
    if (editor?.getGrammar() === lumine.grammars.nullGrammar) return [];
    if (!prefix || signal?.aborted || !this.isAvailable(scopeDescriptor)) return [];
    if (
      !(await this.snippets.waitForSnippetsLoaded()) ||
      signal?.aborted ||
      editor?.getGrammar() === lumine.grammars.nullGrammar ||
      !this.isAvailable(scopeDescriptor)
    ) {
      return [];
    }

    const suggestions = [];
    // The menu needs metadata, not parsed bodies or live tab stops. Expansion
    // parses the chosen snippet through the same scoped selector store later.
    const first = prefix[0].toLowerCase();
    for (const snippet of Object.values(
      this.snippets.snippetAttributesForScopes(scopeDescriptor),
    )) {
      if (
        typeof snippet?.body !== "string" ||
        !snippet.prefix ||
        snippet.prefix[0].toLowerCase() !== first
      ) {
        continue;
      }
      suggestions.push({
        type: "snippet",
        text: snippet.prefix,
        replacementPrefix: prefix,
        rightLabel: snippet.name,
        rightLabelHTML: snippet.rightLabelHTML,
        leftLabel: snippet.leftLabel,
        leftLabelHTML: snippet.leftLabelHTML,
        description: snippet.description,
        descriptionMoreURL: snippet.descriptionMoreURL,
      });
    }
    suggestions.sort((a, b) => a.text.localeCompare(b.text));
    return suggestions;
  }

  onDidInsertSuggestion({ editor }) {
    if (editor.getGrammar() === lumine.grammars.nullGrammar) return;
    const scope = editor.getLastCursor()?.getScopeDescriptor();
    if (!this.isAvailable(scope)) return;
    return lumine.commands.dispatch(lumine.views.getView(editor), "snippets:expand");
  }
};
