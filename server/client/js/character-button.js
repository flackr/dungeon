dungeon.CharacterButton = (function() {

  var initialized_ = false;

  /* @const */ var POWER_ORDERING_PREFERENCE = [
    'No Action',
    'Immediate Interrupt',
    'Immediate Reaction',
    'Free Action',
    'Minor Action',
    'Move Action',
    'Standard Action'
  ];

  function characterButton_(characterData) {
    var template = $('character-template');
    var element = template.cloneNode(true);
    element.id = '';
    var name = characterData.name;
    var player = characterData.player ? 
        '(' + characterData.player + ')' : '';
    setCharacterAttribute_(element, 'name', name);
    setCharacterAttribute_(element, 'player', player);
    // TODO(kellis): Option to sensor info for the bad guys.
    setCharacterAttribute_(element, 'level', characterData.level);
    setCharacterAttribute_(element, 'class', characterData.charClass);
    element.addEventListener('click', showCharacterSheet_.bind(undefined, characterData));

    $('stats-button').addEventListener('click', showStatsTab_);
    $('powers-button').addEventListener('click', showPowersTab_);

    return element;
  }

  function setCharacterAttribute_(characterElement, attributeName, attributeValue) {
    var className = 'character-button-' + attributeName;
    if (attributeValue == undefined)
      attributeValue = '?';
    characterElement.getElementsByClassName(className)[0].textContent = attributeValue;
  }

  function showCharacterSheet_(characterData) {
    if (!initialized_) {
      createCharacterSheet_(characterData);
      initialized_ = true;
    }
    populateCharacterSheet_(characterData);
    dungeon.Client.prototype.onSelectView('character');
  }

  function showStatsTab_() {
    $('powers-tab').hidden = true;
    $('stats-tab').hidden = false;
    $('powers-button').setAttribute('active', false);
    $('stats-button').setAttribute('active', true);
  }

  function showPowersTab_() {
    $('stats-tab').hidden = true;
    $('powers-tab').hidden = false;
    $('stats-button').setAttribute('active', false);
    $('powers-button').setAttribute('active', true);
  }

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
    $('encounter-list').textContent = '';
    $('daily-list').textContent = '';

    var list = sortPowers_(characterData);
    for (var i = 0; i < list.length; i++) {
      var power = list[i];
      var name = power.name;
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
      $(usage.toLowerCase() + '-list').appendChild(block);
    }
  }
  return characterButton_;

})();


