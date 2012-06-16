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
    load($('combat-overview-page'), this.initialize.bind(this, client));
  };

  CombatOverviewPage.prototype = {

    initialize: function(client) {
      this.client = client;
      client.addEventListener('character-added', this.onAddCharacter.bind(this));
      client.addEventListener('character-updated', this.onUpdateCharacter.bind(this));
    },

    onAddCharacter: function(character) {
      var entry = $('combat-overview-summary-template').cloneNode(true);
      entry.id = '';
      this.setField(entry, 'combat-overview-name', character.name);
      this.updateCharacterInfo(entry, character);
      $('combat-overview-list').appendChild(entry);
    },

    updateCharacterInfo: function(entry, character) {
      var initiative = character.initiative;
      if (initiative == undefined)
        initiative = '?';
      this.setField(entry, 'combat-overview-initiative', initiative);
      this.setField(entry, 
                    'combat-overview-hp', 
                    character.condition.stats['Hit Points'] 
                        + '/ ' + character.source.stats['Hit Points'], 
                    'Hit Points');
      var temps = character.condition.stats['Temps'];
      if (temps == undefined)
        temps = 0;
      this.setField(entry, 'combat-overview-temps', temps, 'Temps');
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
      var actionPoints = character.condition.stats['Action Points'];
      if (actionPoints == undefined)
        actionPoints = 1;
      this.setField(entry, 'combat-overview-action-points', actionPoints, 'Action Points');
      this.setField(entry, 
                    'combat-overview-healing-surges-remaining',
                    character.condition.stats['Healing Surges'], 
                    'Healing Surges');
      var usedSecondWind = character.condition.stats['Used Second Wind'];
      if (usedSecondWind == undefined)
        usedSecondWind = 'no';
      this.setField(entry, 
                    'combat-overview-second-wind-used', 
                    usedSecondWind, 
                    'Used Second Wind');
    },

    setField: function(entry, name, value, opt_stat) {
      var field = entry.getElementsByClassName(name)[0];
      if (!opt_stat) {
        field.textContent = value;
      } else {
        var index = String(value).indexOf('/');
        var suffix = null;
        if (index > 0) {
          suffix = value.substring(index);
          value = value.substring(0, index);
        }
        field.textContent = '';
        var input = document.createElement('input');
        input.setAttribute('type', 'text');
        field.appendChild(input);
        input.value = value;
        if (suffix) {
          var span = document.createElement('span');
          span.textContent = suffix;
          field.appendChild(span);
        }
        var self = this;
        input.addEventListener('change', function() {
          var element = input.parentNode;
          while (!element.classList.contains('combat-overview-summary'))
            element = element.parentNode;
          element = element.getElementsByClassName('combat-overview-name')[0];
          var characterName = element.textContent;
          var evt = {
            type: 'use-power',
            character: self.client.getCharacterIndex(characterName),
            power: 'Stat-tweak',
            data: {
              stat: opt_stat,
              tweak: input.value
            }
          };
          self.client.sendEvent(evt);
        });
      }
    },

    onUpdateCharacter: function(index) {
      var characterData = this.client.getCharacter(index);
      var nodes = $('combat-overview-list').getElementsByClassName('combat-overview-name');
      var targetName = characterData.name;
      for (var i = 0; i < nodes.length; i++) {
        var candidate = nodes[i].textContent;
        if (candidate == targetName) {
          var element = nodes[i];
          while (!element.classList.contains('combat-overview-summary'))
            element = element.parentNode;
          this.updateCharacterInfo(element, characterData);
          break;
        }
      }
    },

    sortIntoInitiativeOrder: function() {
      var data = [];
      var entries = $('combat-overview-list').getElementsByClassName('combat-overview-summary');
      var getValue = function(parent, name) {
        var entry = parent.getElementsByClassName('combat-overview-' + name)[0];
        if (entry)
          return entry.textContent;
      }
      for (var i = 1; i < entries.length; i++) {
        var initiative = getValue(entries[i], 'initiative');
        var name = getValue(entries[i], 'name');
        data.push({initiative: initiative, name: name, entry: entries[i]});
      }
      var comparator = function(a, b) {
        var result = 0;
        if (a.initiative != b.initiative)
          result = String(b.initiative) > String(a.initiative) ? 1 : -1;
        else 
          result = a.name > b.name ? 1 : -1;
        return result;
      }
      data.sort(comparator);
      for (var i = entries.length - 1; i > 0; i--)
        $('combat-overview-list').removeChild(entries[i]);
      for (var i = 0; i < data.length; i++)
        $('combat-overview-list').appendChild(data[i].entry);
    }
  };


  return CombatOverviewPage;

})();
