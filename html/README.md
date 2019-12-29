README.md for dungeon/html

This directory contains a simple tile-laying dungeon mapper.

Feature list:
 [x] import images from Gloomhaven
 [x] overlay hex grid, with targeting
 [x] enable click-to-place for the selected "template"
 [x] enable drag and drop
 [x] fix favicon
 [] select a tile
 [] delete a tile
 [] show a selection of tiles in the palette
 [] allow the palette to be shown/hidden (edge-hover?)
 [] rotate a tile
 [] targeting. Palette should capture events, not pass them through to map.

Challenges
  - how should we read in the file template (file B1b is 4X4, offest (x,y),
  oriented pointy-side-up) -- I'm thinking a simple json file with metadata?
  - need to resize the images to conserve memory
  - need to figure out a strategy for caching or sharing these tile files.
Known issues:
  - single tile objects show a white border. This is unfortunate.

Randomness
  - debugger causes a debugbreak in javascript. Fires into chrome debugger.