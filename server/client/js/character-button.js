dungeon.CharacterButton = (function() {


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
    return element;
  }

  function setCharacterAttribute_(characterElement, attributeName, attributeValue) {
    var className = 'character-button-' + attributeName;
    if (attributeValue == undefined)
      attributeValue = '?';
    characterElement.getElementsByClassName(className)[0].textContent = attributeValue;
  }

  return characterButton_;

})();


