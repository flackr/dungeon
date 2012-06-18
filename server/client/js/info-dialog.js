dungeon.InfoDialog = function(client) {
  dungeon.Dialog.apply(this, [client, 'info']);
}

dungeon.InfoDialog.prototype = {
  __proto__: dungeon.Dialog.prototype,

  initialize: function(client, name) {
    dungeon.Dialog.prototype.initialize.call(this, client, name);
  },

  setTitle: function(title) {
    $('info-dialog-title').textContent = title;
  },

  setMessage: function(message) {
    $('info-dialog-message').textContent = message;
  },
};
