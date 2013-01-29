/**
 * Parser for loading content into Dungeon.  Currently limited to importing
 * characters, but will be extended to handle other file types as well.
 * @param {dungeon.Client} client The target client for receiving load
 *     notification.
 * @param {File} The file to load.
 */
dungeon.ParseFile = function(client, file) {
  var reader = new FileReader();
  var filename = file.name;
  reader.onload = function(evt) {
    // TODO(kellis): Should handle json input too for reloading saved state.
    var fileContent = evt.target.result;

    try {
      var json;
      if ((json = JSON.parse(fileContent)) && json.type) {
        if (json.type == 'map') {
          json.type = 'load-map';
          client.sendEvent(json);
        } else if (json.type == 'powers') {
          json.type = 'load-powers';
          client.sendEvent(json);
        }
        return;
      }
    } catch(err) {
      console.log('Failed to read '+filename+' as json');
    }

    var parser=new DOMParser();
    var xmlDoc = parser.parseFromString(fileContent, "text/xml");
    // Inspect the root node to determine which parser we should use.
    var rootName = xmlDoc.childNodes[0].nodeName;
    if(rootName == 'D20Character' || rootName == 'Monster') {
      var json = rootName == 'D20Character' ? 
          dungeon.ParseCharacter(xmlDoc) :
          dungeon.ParseMonster(xmlDoc);
      // Add default name if missing on import.  This is the case for sample
      // characters.
      if (!json.name || json.name == '') {
        var index = filename.indexOf('.');
        json.name = dungeon.ImportUtilities.convertFromCamelCase(
            filename.substring(0, index));
        json.stats['Name'] = json.name;
      }
      var evt = {
        type: 'register-character-prototype',
        character: json
      };
      client.sendEvent(evt, true);
      return;
    } else {
      alert('Futile attemp to load a file of type: ' + rootName);
    }
  }
  // TODO(kellis): Look at mime type to see if this is an image file.
  // If so, we can add it to a client side image gallery. Within the map editor
  // we can then select a map to share with the rest of the clients.  Perhaps
  // encoding the map data as base64. 
  reader.readAsText(file);
}

// Assortment of useful utilities for file parsing.

dungeon.ImportUtilities = {};

dungeon.ImportUtilities.convertFromCamelCase = function(name) {
    var chars = [];
    var armInsertSpace = false;
    for (var i = 0; i < name.length; i++) {
      var ch = name.charAt(i);
      var isUpperCase = (ch == ch.toUpperCase());
      if (isUpperCase) {
        if (armInsertSpace) {
          chars.push(' ');
          armInsertSpace = false;
        }
      } else {
        armInsertSpace = true;
      }
      chars.push(ch);
    }
    if(chars.length > 0)
      chars[0] = chars[0].toUpperCase();
    return chars.join('');
  }


