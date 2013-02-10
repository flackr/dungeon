dungeon.PowerEditorDialog = (function() {

  PowerEditorDialog = function(client) {
    dungeon.Dialog.apply(this, [client, 'power-editor']);
  }

  PowerEditorDialog.prototype = {

    __proto__: dungeon.Dialog.prototype,

    initialize: function(client, name) {
      dungeon.Dialog.prototype.initialize.call(this, client, name);
    },

    /**
     * Called to initialize the dialog prior to opening based in the current
     * state of the power.
     */
    update: function(characterData, power) {
      $('edit-power-name').textContent = power.name;
      // Call language parser to interpret power.
      // TODO(kellis): Parse when accessing power for first time. 
      // Doing the work here while debugging the parser.
      var description = power['Hit'];
      var script = dungeon.LanguageParser.generateScript(
          characterData, power.name);
      $('power-script').textContent = script;
    },

    /**
     * Called before closing the dialog to archive the changes.
     */
    commit: function() {
      // TODO(kellis): Save updated power.
      console.log('dungeon.PowerEditorDialog.commit()');
    }
  };

  return PowerEditorDialog;
})();
