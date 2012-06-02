dungeon.CharacterButton = (function() {

  var initialized_ = false;

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
    $('close-button').addEventListener('click', showCombatSheet_);
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
    // TODO(kellis): initialize page content.
    $('combat-page').hidden = true;
    $('character-page').hidden = false;
  }

  function showCombatSheet_() {
    $('character-page').hidden = true;
    $('combat-page').hidden = false;
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

  function populateCharacterSheet_(characterData) {
    var populateStatEntries = function(category) {
      var list = characterData[category];
      for (var i = 0; i < list.length; i++) {
        var name = list[i];
        var stat = $(name + '-stat');
        var value = characterData.stats[name];
        if (value == undefined)
          value = '?';
        var modifier = characterData.stats[name + ' modifier'];
        stat.getElementsByClassName('stat-name')[0].textContent = name + ':';
        stat.getElementsByClassName('stat-value')[0].textContent = value;
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

    var list = characterData.powers;
    for (var i = 0; i < list.length; i++) {
      var power = list[i];
      var name = power.name;
      var usage = power['Power Usage'];
      var type = power['Action Type'];
      var block = $('power-template').cloneNode(true);
      block.id = '';
      block.getElementsByClassName('power-name')[0].textContent = name;
      block.getElementsByClassName('power-type')[0].textContent = type;
      $(usage.toLowerCase() + '-list').appendChild(block);
    }
  }

  return characterButton_;

})();


