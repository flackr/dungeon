/**
 * Button for an imported character or monster.  
 */

dungeon.CharacterButton = (function() {

  function f(client, characterData) {
    var el = document.createElement('div');
    el.data = {};
    el.data.client = client;
    el.data.character = characterData;
    f.decorate(el);
    return el;
  }

  f.decorate = function(el) {
    el.__proto__ = f.prototype;
    el.decorate();
  };

  return f;

})();

dungeon.CharacterButton.prototype = {
  __proto__: HTMLDivElement.prototype,

  dragIcon_: null,

  decorate: function() {
    var template = $('character-template');
    var name = this.data.character.name;
    this.id = name + '-character-button';
    this.className = template.className;
    var nodes = template.childNodes;
    for(var i = 0; i < nodes.length; i++)
      this.appendChild(nodes[i].cloneNode(true));
    this.setCharacterAttribute_(this, 'name', name);
    // TODO(kellis): Option to sensor info for the bad guys.
    this.setCharacterAttribute_(this, 'level', this.data.character.level);
    this.setCharacterAttribute_(this, 'class', this.data.character.charClass);
    this.addEventListener('click', function() {
      this.data.client.dispatchEvent('character-selected', this.data.character);
    });

    // Drag-n-drop onto the map.
    this.addEventListener('dragstart', this.onDragStart_.bind(this), false);
    this.addEventListener('dragend', this.onDragEnd_.bind(this), false);

    // Create drag icon.
    if (!this.dragIcon_) {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      var context = canvas.getContext('2d');
      var drawShape = function(color, width) {
        context.strokeStyle = context.fillStyle = color;
        context.lineWidth = width;
        context.beginPath();
        context.arc(16, 16, 12, 0, 2*Math.PI, true);
        context.moveTo(16, 3);
        context.lineTo(16, 29);
        context.moveTo(3, 16);
        context.lineTo(29, 16);
        context.arc(16, 16, 8, 0, 2*Math.PI, true);
        context.stroke();
      };
      drawShape('#000', 4);
      drawShape('#ff0', 2);      
      this.dragIcon_ = new Image();
      this.dragIcon_.src = canvas.toDataURL('image/png');
      // Reuse icon for other characters.
      dungeon.CharacterButton.prototype.dragIcon_ = this.dragIcon_;
    }
  },

  setCharacterAttribute_: function(characterElement, attributeName, attributeValue) {
    var className = 'character-button-' + attributeName;
    if (attributeValue == undefined)
      attributeValue = '?';
    characterElement.getElementsByClassName(className)[0].textContent = attributeValue;
  },

  onDragStart_: function(e) {
    dungeon.Client.prototype.onSelectView('page', 'map');
    this.classList.add('character-button-drag');
    var name = this.getElementsByClassName('character-button-name')[0].textContent;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/xml', '<character name=\"' + name + '\"/>');
    e.dataTransfer.setDragImage(this.dragIcon_, 16, 16);
  },

  onDragEnd_: function(e) {
    this.classList.remove('character-button-drag');
  }
};
