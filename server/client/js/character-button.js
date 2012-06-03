dungeon.CharacterButton = (function() {

  var initialized_ = false;

  var dragIcon_ = null;

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
    var name = characterData.name;
    element.id = name + '-character-button';
    setCharacterAttribute_(element, 'name', name);
    // TODO(kellis): Option to sensor info for the bad guys.
    setCharacterAttribute_(element, 'level', characterData.level);
    setCharacterAttribute_(element, 'class', characterData.charClass);
    element.addEventListener('click', showCharacterSheet_.bind(undefined, characterData));

    // Drag-n-drop onto the map.
    element.addEventListener('dragstart', onDragStart_.bind(element), false);
    element.addEventListener('dragend', onDragEnd_.bind(element), false);

    $('stats-button').addEventListener('click', showStatsTab_);
    $('powers-button').addEventListener('click', showPowersTab_);

    // Create drag-n-drop icon
    // TODO(kellis): Create prettier icon.
    if (!dragIcon_) {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      var context = canvas.getContext('2d');
      context.fillStyle = 'rgb(255, 0, 255)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      dragIcon_ = new Image();
      dragIcon_.src = canvas.toDataURL('image/png');
    }
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
    var buttons = document.getElementsByClassName('character-button');
    for (var i = 0; i < buttons.length; i++)
      buttons[i].setAttribute('active', false);
    var activeButtonName = characterData.name + '-character-button';
    $(activeButtonName).setAttribute('active', true);
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

  function onDragStart_(e) {
    dungeon.Client.prototype.onSelectView('map');
    this.classList.add('character-button-drag');
    var name = this.getElementsByClassName('character-button-name')[0].textContent;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/html', name);
    e.dataTransfer.setDragImage(dragIcon_, 16, 16);
  }

  function onDragEnd_(e) {
    this.classList.remove('character-button-drag');
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
      var category = usage.toLowerCase().trim();
      var index = category.indexOf(' ');
      if (index > 0)
        category = category.substring(0, index);
      $(category + '-list').appendChild(block);
    }
  }

  return characterButton_;

})();


