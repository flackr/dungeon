dungeon.PowerEditorDialog = (function() {

  PowerEditorDialog = function(client) {
    dungeon.Dialog.apply(this, [client, 'power-editor']);
  }

  PowerEditorDialog.prototype = {

    __proto__: dungeon.Dialog.prototype,

    initialize: function(client, name) {
      dungeon.Dialog.prototype.initialize.call(this, client, name);
      $('power-export-button').addEventListener('click', this.onExport.bind(this));
      $('power-reset-button').addEventListener('click', this.onReset.bind(this));
      $('power-revert-button').addEventListener('click', this.onRevert.bind(this));
    },

    /**
     * Called to initialize the dialog prior to opening based in the current
     * state of the power.
     */
    update: function(characterData, powerName) {
      $('edit-power-name').textContent = powerName;
      var powers = dungeon.Powers.getInstance();
      this.power = powers.get(powerName);
      this.characterData = characterData;
      this.powerName = powerName;
      this.power.useBy(characterData);
      var script = this.power.getScript();
      $('power-script').value = script;
    },

    /**
     * Called before closing the dialog to archive the changes.  Changes are
     * archived to local storage.
     */
    commit: function() {
      this.saveScript();
    },

    /**
     * Update script in local storage to persist across sessions.  Saves
     * are not automatically propaged to other clients.  Instead use bulk
     * updates via the export feature.
     */
    saveScript: function() {
      var newContent = $('power-script').value;
      var oldContent = this.power.getScript();
      if (newContent != oldContent) {
        var scripts = JSON.parse(localStorage.getItem('dungeon-scripts'));
        if (!scripts)
          scripts = {};
        var characterName = this.characterData.name;
        var character = scripts[characterName];
        if (!character) {
          character = scripts[characterName] = {}; 
        }
        character[this.powerName] = {script: newContent, update: Date.now()};
        localStorage.setItem( 'dungeon-scripts', JSON.stringify(scripts));
        this.power.updateScript(newContent);
      }
    },

    /**
     * Reload after a reset of one or all of the customizations.
     */
    reload: function() {
      this.power.useBy(this.characterData);
      var script = this.power.getScript();
      $('power-script').value = script;
    },

    /**
     * Dispatch local edits to other clients.  Displays a dialog contaning
     * all of the edits, which may be cut-and-pasted to a text file for
     * archiving or loading onto another server.
     */
    onExport: function() {
      this.saveScript();
      var dialog = dungeon.Dialog.getInstance('custom-scripts');
      dialog.show();
    },

    /**
     * Reverts the power currently being editing to the factory default.
     */
    onRevert: function() {
      console.log('revert power');
      var scripts = JSON.parse(localStorage.getItem('dungeon-scripts'));
      if (scripts) {
        var characterName = this.characterData.name;
        var character = scripts[characterName];
        if (character) {
          if (this.powerName in character)
            delete character[this.powerName];
        }
      }
      localStorage.setItem( 'dungeon-scripts', JSON.stringify(scripts));
      this.power.resetScript();
      this.reload();
    },

    /**
     * Clean whipe of all power customizations.
     */
    onReset: function() {
      localStorage.removeItem('dungeon-scripts');
      dungeon.Powers.getInstance().reset();
      this.reload();
    },

  };

  return PowerEditorDialog;
})();
