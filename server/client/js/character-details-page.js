dungeon.CharacterDetailsPage = (function() {

  var initialized_ = false;

  /**
   * Constructor.
   */
  CharacterDetailsPage = function(client) {
    load($('character-page'), this.initialize.bind(this, client));
  };

  CharacterDetailsPage.prototype = {

    initialize: function(client) {
      this.client = client;
      client.addEventListener('character-selected', 
                              this.onCharacterSelect.bind(this));
      $('stats-button').addEventListener('click', this.onShowStats.bind(this));
      $('powers-button').addEventListener('click', this.onShowPowers.bind(this));
    },

    onCharacterSelect: function(characterData) {
      var selectCharacterView = true;
      if ('source' in characterData) {
        characterData = characterData.source;
        selectCharacterView = false;
      }
      if (!this.initialized_) {
        createCharacterSheet_(characterData);
        this.initialized_ = true;
      }
      populateCharacterSheet_(characterData);
      var buttons = document.getElementsByClassName('character-button');
      for (var i = 0; i < buttons.length; i++)
        buttons[i].setAttribute('active', false);
      var activeButtonName = characterData.name + '-character-button';
      $(activeButtonName).setAttribute('active', true);
      if (selectCharacterView)
        this.client.onSelectView('page', 'character');
    },

    onShowStats: function() {
      $('powers-tab').hidden = true;
      $('stats-tab').hidden = false;
      $('powers-button').setAttribute('active', false);
      $('stats-button').setAttribute('active', true);
    },

    onShowPowers: function() {
      $('stats-tab').hidden = true;
      $('powers-tab').hidden = false;
      $('stats-button').setAttribute('active', false);
      $('powers-button').setAttribute('active', true);
    }

  };

  // Private helper methods for creating the character/monster sheet.

  /* @const */ var POWER_ORDERING_PREFERENCE = [
    'No Action',
    'Immediate Interrupt',
    'Immediate Reaction',
    'Free Action',
    'Minor Action',
    'Move Action',
    'Standard Action'
  ];

  function createCharacterSheet_(characterData) {
    var createStatEntries = function(category) {
      var list = $(category + '-list');
      var stats = characterData[category];
      for (var i = 0; i < stats.length; i++) {
        var name = stats[i];
        var stat = $('character-stat-template').cloneNode(true);
        stat.id = name + '-stat';
        list.appendChild(stat);
      }
    }
    createStatEntries('attributes');
    createStatEntries('defenses');
    createStatEntries('health');
    createStatEntries('skills');
    createStatEntries('other');
  }

  function sortPowers_(characterData) {
     var sortIndices = {};
     for (var i = 0; i < POWER_ORDERING_PREFERENCE.length; i++) {
       sortIndices[POWER_ORDERING_PREFERENCE[i]] = i;
     }
     var getIndex = function(power) {
       var action = power['Action Type'];
       return (action in sortIndices) ? sortIndices[action] : 
         POWER_ORDERING_PREFERENCE.length;
     }
     var sortFunction = function(a, b) {
       var diff = getIndex(a) - getIndex(b);
       if (diff == 0)
         diff = a.name < b.name ? -1 : 1;
       return diff;
     }
     var list = characterData.powers;
     list = list.slice(0,list.length);
     return list.sort(sortFunction);
  }

  function SimplifyPowerName(name) {
    // TODO(kellis): Add other filters here as required.
    return name.replace('[Movement Technique]', '(move)');
  }

  function populateCharacterSheet_(characterData) {
    var populateField = function(parent, name, value) {
      parent.getElementsByClassName(name)[0].textContent = value;
    }
    var populateStatEntries = function(category) {
      var list = characterData[category];
      for (var i = 0; i < list.length; i++) {
        var name = list[i];
        var stat = $(name + '-stat');
        var value = characterData.stats[name];
        if (value == undefined)
          value = '?';
        var modifier = characterData.stats[name + ' modifier'];
        populateField(stat, 'stat-name', name + ':');
        populateField(stat, 'stat-value', value);
        var modifierField = stat.getElementsByClassName('stat-modifier')[0];
        if (modifier) {
          if (Number(modifier) > 0)
            modifier = '+' + modifier;
          modifierField.textContent = modifier;
          modifierField.hidden = false;
        } else  {
          modifierField.hidden = true;
        }
      }
    }
    populateStatEntries('attributes');
    populateStatEntries('defenses');
    populateStatEntries('health');
    populateStatEntries('skills');
    populateStatEntries('other');

    $('at-will-list').textContent = '';
    $('recharge-list').textContent = '';
    $('encounter-list').textContent = '';
    $('daily-list').textContent = '';

    var list = sortPowers_(characterData);
    for (var i = 0; i < list.length; i++) {
      var power = list[i];
      var name = SimplifyPowerName(power.name);
      var usage = power['Power Usage'];
      var type = power['Action Type'];
      var block = $('power-template').cloneNode(true);
      block.id = '';
      var title = block.getElementsByClassName('power-title')[0];
      var categoryClass = 'power-' + type.toLowerCase().replace(' ', '-');
      title.classList.add(categoryClass);
      var createToggleDetailsCallback = function(element) {
        return function() {
          var details = element.getElementsByClassName('power-details')[0];
          details.hidden = !details.hidden;
          element.getElementsByClassName('power-details-show')[0].hidden = !details.hidden;
          element.getElementsByClassName('power-details-hide')[0].hidden = details.hidden;
        }
      };
      block.addEventListener('click', createToggleDetailsCallback(block));
      block.getElementsByClassName('power-name')[0].textContent = name;
      block.getElementsByClassName('power-type')[0].textContent = type;
      var effectBlock = block.getElementsByClassName('power-effect')[0];
      if (power.weapons && power.weapons.length > 0) {
        effectBlock.hidden = false;
        // Assume preferred weapon is at the top of the list.
        var weapon = power.weapons[0];
        var weaponName = weapon.name;
        var defense = weapon.defense;
        populateField(effectBlock, 'power-attack-bonus', weapon.toHit);
        populateField(effectBlock, 'power-defense', weapon.defense);
        populateField(effectBlock, 'power-damage', weapon.damage);
        populateField(effectBlock, 'power-weapon', weapon.name);
      }
      var editButton = block.getElementsByClassName('edit-power-button')[0];
      var editPowerCallback = function(element) {
        var selectedPower = power;
        return function(e) {
          e.stopPropagation();
          var dialog = dungeon.Dialog.getInstance('power-editor');
          dialog.update(selectedPower);
          dialog.show();
        }
      };
      editButton.addEventListener('click', editPowerCallback());

      var category = usage.toLowerCase().trim();
      var index = category.indexOf(' ');
      if (index > 0)
        category = category.substring(0, index);
      $(category + '-list').appendChild(block);
    }

    var setListVisibility = function(name) {
      var list = $(name);
      list.parentNode.parentNode.hidden = list.childNodes.length == 0;
    }
    setListVisibility('at-will-list');
    setListVisibility('recharge-list');
    setListVisibility('encounter-list');
    setListVisibility('daily-list');
  }

  return CharacterDetailsPage;

})();
