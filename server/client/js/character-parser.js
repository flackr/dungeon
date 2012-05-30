dungeon.ParseCharacter = (function() {

  // Canonical form for stat names, mapping from a given
  // stat to a preferred alias that may be missing from
  // older XML representations.
  var aliasMap_ = {
    'Fortitude Defense': 'Fortitude',
    'Reflex Defense': 'Reflex',
    'Will Defense': 'Will',
    'Intelligence Modifier': 'Intelligence modifier' 
  };
  
  function parseCharacter_(filename, xmlContent) {
    var parser=new DOMParser();
    var xmlDoc = parser.parseFromString(xmlContent,"text/xml");
    // Relevant sections in the D&D character sheet.
    var characterSheet = xmlDoc.getElementsByTagName('CharacterSheet')[0];
    if (characterSheet == undefined) {
      // Could be generic/sample character.
      // Try simply parsing the root node.
      characterSheet = xmlDoc;
    }
    var details = characterSheet.getElementsByTagName('Details')[0];
    var ruleSet = xmlDoc.getElementsByTagName('RulesElementTally')[0];
    // Set of rules that apply to the character
    var rules = ruleSet.getElementsByTagName('RulesElement');

    var charClass = extractRulesByType_(rules, 'Class')[0];
    var stats =  extractStats(characterSheet);
    var index = filename.indexOf('.');
    var defaultName = convertFromCamelCase_(filename.substring(0, index));
    var name = details ? extractBasicAttribute_(details, 'name') : defaultName;
    var player = details ? extractBasicAttribute_(details, 'Player') : '';
    var level = details ?  Number(extractBasicAttribute_(details, 'Level')) : '?';
    var size = extractRulesByType_(rules, 'Size')[0];
    if (size != undefined) {
      stats['Size'] = size;
    }
    stats['Class'] = charClass;
    stats['Name'] = name;
    var json = {
       name: name,
       player: player,
       level: level,
       charClass: charClass,
       stats: stats, // (name,value) set of all character stats (includes aliases).
       attributes: extractAttributes_(characterSheet), // List of ability/attribute names.
       skills: extractRulesByType_(rules, 'Skill'), // List of skill names
       defenses: ['AC', 'Fortitude', 'Reflex', 'Will'],
       health: ['Hit Points', 'Bloodied', 'Surge Amount', 'Healing Surges'],
       other: ['Name', 'Class', 'Level', 'Initiative', 'Speed', 'Passive Perception', 
               'Passive Insight', 'Size'],
    };
    return json;
  }

  function extractBasicAttribute_(el, tag) {
    var matches = el.getElementsByTagName(tag);
    if (matches && matches.length == 1)
      return matches[0].textContent;
  }

  function extractRulesByType_(rules, targetType) {
    var results = [];
    for (var i = 0; i < rules.length; i++) {
       var r = rules[i];
       var type = r.getAttribute('type');
       if (type == targetType) {
         results.push(r.getAttribute('name'));
       }
    }
    return results;
  }

  function extractAttributes_(node) {
    var attributes = [];
    var baseAbilities = node.getElementsByTagName('AbilityScores')[0];
    var children = baseAbilities.childNodes;
    for (var i = 0; i < children.length; i++) {
      var node = children[i];
      if (node.nodeType != 1)
        continue;
      var name = node.tagName;
      attributes.push(name);
    }
    return attributes;
  }

  function extractSkills_(rules) {
    return extractRulesByType_(rules, 'skill');
  }

  function extractStats(node) {
    var statMap = {};
    var statBlock = node.getElementsByTagName('StatBlock')[0];
    if (statBlock == undefined) 
      statBlock = node; // older file format stores stats in the root node.
    var stats = statBlock.getElementsByTagName('Stat');
    for (var i = 0; i < stats.length; i++) {
      var stat = stats[i];
      var value = stat.getAttribute('value');
      var aliases = stats[i].getElementsByTagName('alias');
      // TODO(kellis): Check for duplication within aliases.
      for (var j = 0; j < aliases.length; j++) {
         var name = aliases[j].getAttribute('name');
         statMap[name] = value;
      }
    }
    // Ensure that preferred alias for a stat is in the map.
    for (key in aliasMap_) {
      var target = aliasMap_[key];
      if (!(target in statMap) && key in statMap) {
         statMap[target] = statMap[key];
      }
    }
    // Add derived stats that are not part of the XML save format.
    var hp = Number(statMap['Hit Points']);
    statMap['Bloodied'] = Math.floor(hp/2);
    statMap['Surge Amount'] = Math.floor(hp/4);
    if (!('Passive Insight' in statMap))
      statMap['Passive Insight'] = Number(statMap['Insight']) + 10;
    if (!('Passive Perception' in statMap))
      statMap['Passive Perception'] = Number(statMap['Perception']) + 10;
    return statMap;
  }

  function convertFromCamelCase_(name) {
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
    return chars.join('');
  }
 
  return parseCharacter_;

})();


