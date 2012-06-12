dungeon.CombatOverviewPage = (function() {

  var sampleEffects = [
    'slowed',
    'poison 5',
    'dazed',
    'immobalized',
    'fire 8',
    'cold 4',
    'hungry',
    'grumpy'
  ];

  /**
   * Constructor.
   */
  CombatOverviewPage = function(client) {
    this.initialize(client);
  };

  CombatOverviewPage.prototype = {

    initialize: function(client) {
      this.client = client;
      client.addEventListener('character-added', this.onAddCharacter.bind(this));
    },

    onAddCharacter: function(character) {
      var entry = $('combat-overview-summary-template').cloneNode(true);
      entry.id = '';
      this.setField(entry, 'combat-overview-name', character.name);
      this.setField(entry, 'combat-overview-hp', character.condition.stats['Hit Points']);
      var temps = character.condition.stats['Temps'];
      if (temps == undefined)
        temps = 0;
      this.setField(entry, 'combat-overview-temps', temps);
      // TODO(kellis): Add list of ongoing effects.
      this.setField(entry, 'combat-overview-effects', '');
      // Assign at random for now, just for illustrative purposes.
      var nEffects = Math.floor(3*Math.random());
      var randomEffects = [];
      var choices =  sampleEffects.length;
      var map = [];
      for (var i = 0; i < choices; i++)
        map.push(i);
      var effectList = document.createElement('ul');
      for (var i = 0; i < nEffects; i++, choices--) {
        var nEffect = Math.floor(choices*Math.random());
        var choice = map[nEffect];
        map[nEffect] = map[choices-1];
        var effect = document.createElement('li');
        effect.textContent = sampleEffects[choice];
        effectList.appendChild(effect);
      }
      entry.getElementsByClassName('combat-overview-effects')[0].appendChild(effectList);

      // TODO(kellis): Track action points and heals used.
      this.setField(entry, 'combat-overview-action-points', 1);
      this.setField(entry, 'combat-overview-healing-surges-remaining',
          character.condition.stats['Healing Surges']);
      this.setField(entry, 'combat-overview-second-wind-used', 'no');
      $('combat-overview-list').appendChild(entry);
    },

    // TODO(kellis): Subscribe to 'character-updated' to update fields.

    setField: function(entry, name, value) {
      var field = entry.getElementsByClassName(name)[0];
      field.textContent = value;
    },
  };


  return CombatOverviewPage;

})();
