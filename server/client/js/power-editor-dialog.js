dungeon.PowerEditorDialog = (function() {

  PowerEditorDialog = function(client) {
    dungeon.Dialog.apply(this, [client, 'power-editor']);
  }

  /* @const */ var Keywords = [
    'Acid',
    'Arcane',
    'Augmentable',
    'Beast Form',
    'Charm',
    'Cold',
    'Conjuration',
    'Divine',
    'Fear',
    'Fire',
    'Force',
    'Full Discipline',
    'Healing',
    'Illusion',
    'Implement',
    'Lightning',
    'Martial',
    'Necrotic',
    'Poison',
    'Polymorph',
    'Primal',
    'Psionic',
    'Psychic',
    'Radiant',
    'Rage',
    'Reliable',
    'Sleep',
    'Spirit',
    'Stance',
    'Teleportation',
    'Thunder',
    'Varies',
    'Weapon',
    'Zone',
  ];

  PowerEditorDialog.prototype = {

    __proto__: dungeon.Dialog.prototype,

    initialize: function(client, name) {
      dungeon.Dialog.prototype.initialize.call(this, client, name);
      var keywordSelector = $('edit-add-keyword');
      for (var i = 0; i < Keywords.length; i++) {
        var option = document.createElement('option');
        option.value = option.textContent = Keywords[i];
        keywordSelector.appendChild(option);
      }
      $('edit-add-keyword').addEventListener('change', this.onAddKeyword.bind(this));
      $('edit-add-effect').addEventListener('click', this.onAddEffect.bind(this));
    },

    onAddKeyword: function() {
      var selector = $('edit-add-keyword');
      var selection = selector.value;
      if (selection.length > 0) {
        var insertPoint = -1;
        var list = $('edit-keyword-list');
        var nodes = list.childNodes;
        for (var i = 0; i < nodes.length; i++) {
          var label = nodes[i].getElementsByClassName('edit-keyword-label')[0].textContent;
          if (label == selection)
            return; // Already in list.
          if (label > selection) {
            insertPoint = i;
            break;
          }
        }
        var keywordBlock = $('edit-keyword-template').cloneNode(true);
        keywordBlock.id = '';
        keywordBlock.getElementsByClassName('edit-keyword-label')[0].textContent = selection;
        keywordBlock.getElementsByClassName('edit-keyword-remove')[0].addEventListener(
          'click',
          function() {
            list.removeChild(keywordBlock);
          });
        if (insertPoint >= 0)
          list.insertBefore(keywordBlock, nodes[insertPoint]);
        else
          list.appendChild(keywordBlock);
      }
    },

    onAddEffect: function() {
      // TODO(kellis): Implement me.
      var dialog = dungeon.Dialog.getInstance('info');
      dialog.setTitle('Not implemented');
      dialog.setMessage('Stay tuned!!');
      dialog.show();
    },

    /**
     * Called to initialize the dialog prior to opening based in the current state of the power.
     */
    update: function(power) {
      $('edit-power-name').textContent = power.name;
      // TODO(kellis): implement me.  Fill in as much details as possible about the power.
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
