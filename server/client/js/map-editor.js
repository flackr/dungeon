dungeon.MapEditor = (function() {

  var tools = null;

  var tiles = null;

  var pendingMapTiles = [];

  function initialize(toolsDiv, tilesDiv) {
    tools = toolsDiv;
    tiles = tilesDiv;
    //tiles.addEventListener('click', selectTile);
    //tools.addEventListener('click', selectTool);
    if (tiles && pendingMapTiles.length) {
      loadTiles(pendingMapTiles);     
      pendingMapTiles = [];
    }
  }

  function loadTiles(mapTiles) {
    if (!tiles) {
      // The Map editor has not been initialized yet.
      // Defer loading of tiles.
      pendingMapTiles = [];
      mapTiles.forEach(function(tile) {
        pendingMapTiles.push(tile);
      });
      return;
    }

    while (tiles.childNodes.length) {
      tiles.removeChild(tiles.childNodes[0]);
    }
    for (var i = 0; i < mapTiles.length; i++) {
      var tileBtn = document.createElement('img');
      tileBtn.setAttribute('src', mapTiles[i].src);
      tiles.appendChild(tileBtn);
    }
  }

  function selectTool(e) {
    e.stopPropagation();
    var target = e.target;
    while (target && target.parentNode != tools)
      target = target.parentNode;
    for (var i = 0; i < tools.children.length; i++)
      tools.children[i].removeAttribute('selected');
    target.setAttribute('selected', true);
  }

  function selectTile(e) {
    e.stopPropagation();
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
    return tiles.selectedIndex;
  }

  function selectedSize() {
    var selected = tools.selected;
    return selected ? parseInt(selected.textContent) : 1;
  }

  return {
    initialize: initialize,
    loadTiles: loadTiles,
    selectedTile: selectedTile,
    selectedSize: selectedSize,
  };

})();

/*
document.addEventListener('DOMContentLoaded', function() {
  dungeon.MapEditor.initialize($('map-functions'), $('map-tiles'));
});
*/
