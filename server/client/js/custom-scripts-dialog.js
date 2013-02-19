dungeon.CustomScriptsDialog = (function() {

  CustomScriptsDialog = function(client) {
    dungeon.Dialog.apply(this, [client, 'custom-scripts']);
  }

  CustomScriptsDialog.prototype = {

    __proto__: dungeon.Dialog.prototype,

    initialize: function(client, name) {
      dungeon.Dialog.prototype.initialize.call(this, client, name);
    },

    show: function() {
      var scripts = JSON.parse(localStorage.getItem('dungeon-scripts'));
      this.json = {
        type: 'powers',
        data: scripts
      };
      $('custom-script-field').value = JSON.stringify(this.json);
      dungeon.Dialog.show(this.name);
    },

    /**
     * Called before closing the dialog to archive the changes.
     * Notify other clients of the script customizations.
     */
    commit: function() {
      this.json.type = 'load-powers';
      this.client.sendEvent(this.json);
    },

  };

  return CustomScriptsDialog;
})();
