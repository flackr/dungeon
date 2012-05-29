
dungeon.CharacterButton = function(characterData) {
  this.initialize(characterData);
}

dungeon.CharacterButton.prototype = {

  initialize: function(characterData) {
    var template = $('character-template');
    var element = template.cloneNode(true);
    element.id = '';
    var name = characterData.name;
    var player = characterData.player ? 
        '(' + characterData.player + ')' : '';
    this.characterList[name] = element;
    this.setCharacterAttribute(element, 'name', name);
    this.setCharacterAttribute(element, 'player', player);
    // TODO(kellis): Option to sensor info for the bad guys.
    this.setCharacterAttribute(element, 'level', characterData.level);
    this.setCharacterAttribute(element, 'class', characterData.charClass);
    return element;
  },

  setCharacterAttribute: function(characterElement, attributeName, attributeValue) {
    var className = 'character-button-' + attributeName;
    if (attributeValue == undefined)
      attributeValue = '?';
    characterElement.getElementsByClassName(className)[0].textContent = attributeValue;
  },

}
