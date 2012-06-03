dungeon.MapEditor = (function() {

  var tools;
  var tiles;

  function initialize(toolsDiv, tilesDiv) {
    tools = toolsDiv;
    tiles = tilesDiv;
    tiles.addEventListener('click', selectTile);
  }

  function loadTiles(mapTiles) {
    while (tiles.childNodes.length) {
      tiles.removeChild(tiles.childNodes[0]);
    }
    for (var i = 0; i < mapTiles.length; i++) {
      var tileBtn = document.createElement('img');
      tileBtn.setAttribute('src', mapTiles[i].src);
      tiles.appendChild(tileBtn);
    }
  }

  function selectTile(e) {
    var target = e.target;
    while (target && target.parentNode != tiles)
      target = target.parentNode;
    if (target.hasAttribute('selected')) {
      target.removeAttribute('selected');
      return;
    }
    for (var i = 0; i < tiles.childNodes.length; i++)
      tiles.childNodes[i].removeAttribute('selected');
    target.setAttribute('selected', true);
  }

  function selectedTile() {
    for (var i = 0; i < tiles.childNodes.length; i++) {
      if (tiles.childNodes[i].hasAttribute('selected')) {
        return i;
      }
    }
    return -1;
  }

  return {
    initialize: initialize,
    loadTiles: loadTiles,
    selectedTile: selectedTile,
  };

})();

document.addEventListener('DOMContentLoaded', function() {
  dungeon.MapEditor.initialize($('map-functions'), $('map-tiles'));
});
