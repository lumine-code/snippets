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

  async getSuggestions({ scopeDescriptor, prefix }) {
    if (!prefix || !this.isAvailable(scopeDescriptor)) return [];
    if (!(await this.snippets.waitForSnippetsLoaded()) || !this.isAvailable(scopeDescriptor)) {
      return [];
    }

    const suggestions = [];
    for (const snippet of Object.values(this.snippets.parsedSnippetsForScopes(scopeDescriptor))) {
      if (!snippet?.prefix || snippet.prefix[0].toLowerCase() !== prefix[0].toLowerCase()) {
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
    const scope = editor.getLastCursor()?.getScopeDescriptor();
    if (!this.isAvailable(scope)) return;
    return lumine.commands.dispatch(lumine.views.getView(editor), "snippets:expand");
  }
};
