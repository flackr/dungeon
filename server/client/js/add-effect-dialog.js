dungeon.AddEffectDialog = (function() {

  AddEffectDialog = function(client) {
    dungeon.Dialog.apply(this, [client, 'add-effect']);
  }

  AddEffectDialog.prototype = {
    __proto__: dungeon.Dialog.prototype,

    activeCharacter_: null,

    initialize: function(client, name) {
      dungeon.Dialog.prototype.initialize.call(this, client, name);
     $('select-known-effect').addEventListener('change', function() {
        var checked = $('select-known-effect').checked;
        $('select-new-effect').checked = !checked;
        $('known-effect-selection').disabled = false;
        $('new-effect-name').disabled = true;
      });
      $('select-new-effect').addEventListener('change', function() {
        var checked = $('select-new-effect').checked;
        $('select-known-effect').checked = !checked;
        $('known-effect-selection').disabled = true;
        $('new-effect-name').disabled = false;
      });
      // TODO(kellis): Pull in known rules from repository.
    },

    setCharacter: function(characterData) {
      this.activeCharacter_ = characterData;
    },

    commit: function() {
      var effects = [];
      if ($('select-new-effect').checked) {
        var effect = $('new-effect-name').value;
        effects.push(effect);
        $('new-effect-name').value = '';
        var option = document.createElement('option');
        option.value = effect;
        option.textContent = effect;
        // TODO(kellis): Check for duplicates.
        $('known-effect-selection').appendChild(option);
        $('known-effect-selection').disabled = false;
        $('select-known-effect').disabled = false;
        $('select-known-effect').checked = true;
        $('select-new-effect').checked = false;
        $('new-effect-name').disabled = true;
      } else {
        var selector = $('known-effect-selection');
        var nodes = selector.getElementsByTagName('OPTION');
        for (var i = 0; i < nodes.length; i++)
          if (nodes[i].selected)
            effects.push(nodes[i].value);
      }
      if (effects.length > 0) {
        index = this.client.getCharacterIndex(this.activeCharacter_.name);
        var evt = {
          type: 'add-effects',
          character: index,
          effects: effects
        };
        this.client.sendEvent(evt);
      }
    },

  };

  return AddEffectDialog;

})();
