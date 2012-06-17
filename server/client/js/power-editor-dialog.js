dungeon.PowerEditorDialog = function(client) {
  dungeon.Dialog.apply(this, [client, 'power-editor']);
}

dungeon.PowerEditorDialog.prototype = {
  __proto__: dungeon.Dialog.prototype,

  initialize: function(client, name) {
    dungeon.Dialog.prototype.initialize(client, name);
    // Insert dialog specific initialization code here.
  },

  /**
   * Called to initialize the dialog prior to opening based in the current state of the power.
   */
  update: function(power) {
    // TODO(kellis): implement me.
    $('edit-power-name').textContent = power.name;
  },

  /**
   * Called before closing the dialog to archive the changes.
   */
  commit: function() {
    // TODO(kellis): Save updated power.
    console.log('dungeon.PowerEditorDialog.commit()');
  }
}
