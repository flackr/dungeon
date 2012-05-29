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

  function createCharacterSheet_(characterData) {
    var abilityScores = document.createElement('div');
    abilityScores.className = 'stat-block';
    abilityScores.id = 'ability-scores';
    for (var name in characterData.abilityScores) {
      var ability = $('character-stat-template').cloneNode(true);
      ability.id = name + '-stat';
      abilityScores.appendChild(ability);
    }
    $('character-attribute').appendChild(abilityScores);
  }

  function populateCharacterSheet_(characterData) {
    for (var name in characterData.abilityScores) {
      var ability = $(name + '-stat');
      var value = characterData.abilityScores[name];
      ability.getElementsByClassName('stat-name')[0].textContent = name + ':';
      ability.getElementsByClassName('stat-value')[0].textContent = value;
    }
  }

  return characterButton_;

})();


